// Converts ALICE MasterClass J/psi VSD files into PID-only columnar JSON batches
// consumed by the Angular jpsi-analysis module.
//
//   root -l -b -q convert_events.C
//   root -l -b -q 'convert_events.C("vsd", "../../src/assets/exercises/jpsi")'
//
// Unlike data/strangeness/part1/convert_events.C this macro exports no trajectories
// and no decays: the exercise never renders events, it only needs momentum, dE/dx and
// charge. See README.md for the schema and for why there is no energy column.

#include <TDirectory.h>
#include <TEveVSD.h>
#include <TFile.h>
#include <TKey.h>
#include <TMath.h>
#include <TObjArray.h>
#include <TPRegexp.h>
#include <TString.h>
#include <TSystem.h>

#include <cmath>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

namespace {

constexpr Int_t kBatchSize = 100;

struct DatasetConfig {
  const char* fileName;
  const char* id;
  const char* labelKey;
  Int_t trimTo;  // events kept, rounded down to a full hundred
};

// events_0.root is pp and events_1.root is p-Pb. Verified with inspect_vsd.C: the
// second file has more than twice the track multiplicity of the first, which is the
// signature of the larger collision system. checkMultiplicity() re-verifies this so a
// swapped input cannot silently mislabel the datasets.
const std::vector<DatasetConfig> kDatasets = {
  {"events_0.root", "pp", "JPSI.DATASET.PP", 3800},
  {"events_1.root", "pPb", "JPSI.DATASET.PPB", 2300},
};

struct DatasetStats {
  Int_t eventsWritten = 0;
  Int_t batchesWritten = 0;
  Long64_t tracks = 0;
  Long64_t positive = 0;
  Long64_t negative = 0;
  Long64_t zeroDedx = 0;
  Double_t dedxMin = 1e30;
  Double_t dedxMax = -1e30;
  Double_t dedxSum = 0.0;
};

// Column buffers for one batch of events.
struct BatchBuffer {
  std::vector<Int_t> trackOffsets{0};
  std::vector<Double_t> px, py, pz, p, dedx;
  std::vector<Int_t> sign;
  Int_t eventCount = 0;

  void clear() {
    trackOffsets.assign(1, 0);
    px.clear();
    py.clear();
    pz.clear();
    p.clear();
    dedx.clear();
    sign.clear();
    eventCount = 0;
  }
};

// Rounds to four decimals and drops trailing zeros, so 0.1200 becomes 0.12 and an
// integer dE/dx of 78 stays 78. Keeps the assets small without a JSON library.
std::string formatNumber(Double_t value) {
  Double_t rounded = std::round(value * 10000.0) / 10000.0;
  if (rounded == 0.0) {
    return "0";  // also normalises -0
  }

  char buffer[32];
  std::snprintf(buffer, sizeof(buffer), "%.4f", rounded);
  std::string text(buffer);

  const std::size_t dot = text.find('.');
  if (dot != std::string::npos) {
    text.erase(text.find_last_not_of('0') + 1);
    if (!text.empty() && text.back() == '.') {
      text.pop_back();
    }
  }
  return text;
}

void writeDoubleColumn(std::ofstream& out, const char* name, const std::vector<Double_t>& values) {
  out << "\"" << name << "\":[";
  for (std::size_t i = 0; i < values.size(); ++i) {
    if (i > 0) {
      out << ',';
    }
    out << formatNumber(values[i]);
  }
  out << "]";
}

void writeIntColumn(std::ofstream& out, const char* name, const std::vector<Int_t>& values) {
  out << "\"" << name << "\":[";
  for (std::size_t i = 0; i < values.size(); ++i) {
    if (i > 0) {
      out << ',';
    }
    out << values[i];
  }
  out << "]";
}

Bool_t writeBatch(const std::string& directory, const DatasetConfig& dataset, Int_t batchIndex,
                  Int_t firstEventIndex, const BatchBuffer& batch) {
  char name[64];
  std::snprintf(name, sizeof(name), "/batch_%03d.json", batchIndex);
  const std::string path = directory + name;

  std::ofstream out(path);
  if (!out.is_open()) {
    std::cerr << "ERROR: cannot write " << path << std::endl;
    return kFALSE;
  }

  out << "{";
  out << "\"datasetId\":\"" << dataset.id << "\",";
  out << "\"firstEventIndex\":" << firstEventIndex << ",";
  out << "\"eventCount\":" << batch.eventCount << ",";
  writeIntColumn(out, "trackOffsets", batch.trackOffsets);
  out << ",";
  writeDoubleColumn(out, "px", batch.px);
  out << ",";
  writeDoubleColumn(out, "py", batch.py);
  out << ",";
  writeDoubleColumn(out, "pz", batch.pz);
  out << ",";
  writeDoubleColumn(out, "p", batch.p);
  out << ",";
  writeDoubleColumn(out, "dedx", batch.dedx);
  out << ",";
  writeIntColumn(out, "sign", batch.sign);
  out << "}" << std::endl;

  return out.good();
}

// Collects the EventNNN directory keys in file order.
void collectEventKeys(TFile* file, TObjArray& keys) {
  TPMERegexp nameRe("Event\\d+");
  TObjLink* link = file->GetListOfKeys()->FirstLink();
  while (link != nullptr) {
    if (nameRe.Match(link->GetObject()->GetName()) != 0) {
      keys.Add(link->GetObject());
    }
    link = link->Next();
  }
}

Bool_t convertDataset(const DatasetConfig& dataset, const TString& inputDir,
                      const TString& outputDir, DatasetStats& stats) {
  const TString inputPath = inputDir + "/" + dataset.fileName;

  auto* file = TFile::Open(inputPath);
  if (file == nullptr || file->IsZombie()) {
    std::cerr << "ERROR: cannot open " << inputPath << "\n"
              << "       See data/jpsi/README.md for how to obtain the VSD files."
              << std::endl;
    return kFALSE;
  }

  TObjArray eventKeys;
  collectEventKeys(file, eventKeys);

  const Int_t available = eventKeys.GetEntries();
  if (available < dataset.trimTo) {
    std::cerr << "ERROR: " << dataset.fileName << " holds " << available
              << " events but the manifest expects " << dataset.trimTo << ".\n"
              << "       Lower trimTo to the nearest full hundred and rerun." << std::endl;
    return kFALSE;
  }

  const std::string datasetDir = std::string(outputDir.Data()) + "/" + dataset.id;
  gSystem->mkdir(datasetDir.c_str(), kTRUE);

  auto* vsd = new TEveVSD();
  BatchBuffer batch;
  Int_t batchIndex = 0;

  for (Int_t eventIndex = 0; eventIndex < dataset.trimTo; ++eventIndex) {
    auto* key = dynamic_cast<TKey*>(eventKeys.At(eventIndex));
    auto* directory = dynamic_cast<TDirectory*>(key->ReadObj());

    vsd->SetDirectory(directory);
    vsd->LoadTrees();
    vsd->SetBranchAddresses();

    const Int_t nTracks = vsd->fTreeR != nullptr ? vsd->fTreeR->GetEntries() : 0;

    for (Int_t t = 0; t < nTracks; ++t) {
      vsd->fTreeR->GetEntry(t);

      const Double_t trackPx = vsd->fR.fP.fX;
      const Double_t trackPy = vsd->fR.fP.fY;
      const Double_t trackPz = vsd->fR.fP.fZ;
      const Double_t momentum =
        TMath::Sqrt(trackPx * trackPx + trackPy * trackPy + trackPz * trackPz);

      // The MasterClass VSD stores specific energy loss in the unused status field.
      const Double_t trackDedx = vsd->fR.fStatus;
      const Int_t trackSign = vsd->fR.fSign;

      batch.px.push_back(trackPx);
      batch.py.push_back(trackPy);
      batch.pz.push_back(trackPz);
      batch.p.push_back(momentum);
      batch.dedx.push_back(trackDedx);
      batch.sign.push_back(trackSign);

      ++stats.tracks;
      if (trackSign > 0) {
        ++stats.positive;
      } else if (trackSign < 0) {
        ++stats.negative;
      }
      if (trackDedx == 0.0) {
        ++stats.zeroDedx;
      }
      stats.dedxMin = TMath::Min(stats.dedxMin, trackDedx);
      stats.dedxMax = TMath::Max(stats.dedxMax, trackDedx);
      stats.dedxSum += trackDedx;
    }

    batch.trackOffsets.push_back(static_cast<Int_t>(batch.px.size()));
    ++batch.eventCount;

    if (batch.eventCount == kBatchSize) {
      const Int_t firstEventIndex = batchIndex * kBatchSize;
      if (!writeBatch(datasetDir, dataset, batchIndex, firstEventIndex, batch)) {
        return kFALSE;
      }
      ++batchIndex;
      stats.eventsWritten += batch.eventCount;
      batch.clear();
    }
  }

  // trimTo is always a multiple of kBatchSize, so a leftover batch means a bug upstream.
  if (batch.eventCount > 0) {
    const Int_t firstEventIndex = batchIndex * kBatchSize;
    if (!writeBatch(datasetDir, dataset, batchIndex, firstEventIndex, batch)) {
      return kFALSE;
    }
    ++batchIndex;
    stats.eventsWritten += batch.eventCount;
  }

  stats.batchesWritten = batchIndex;
  file->Close();
  return kTRUE;
}

void writeManifest(const TString& outputDir, const std::vector<DatasetStats>& stats) {
  const std::string path = std::string(outputDir.Data()) + "/manifest.json";
  std::ofstream out(path);
  if (!out.is_open()) {
    std::cerr << "ERROR: cannot write " << path << std::endl;
    return;
  }

  out << "{\n";
  out << "  \"batchSize\": " << kBatchSize << ",\n";
  out << "  \"datasets\": [\n";
  for (std::size_t i = 0; i < kDatasets.size(); ++i) {
    const DatasetConfig& dataset = kDatasets[i];
    out << "    { \"id\": \"" << dataset.id << "\", \"labelKey\": \"" << dataset.labelKey
        << "\", \"nEvents\": " << stats[i].eventsWritten
        << ", \"batches\": " << stats[i].batchesWritten << " }";
    if (i + 1 < kDatasets.size()) {
      out << ",";
    }
    out << "\n";
  }
  out << "  ]\n";
  out << "}\n";
}

// The larger collision system must show a clearly higher track multiplicity. If it does
// not, the input files were swapped and every physics conclusion downstream would invert.
Bool_t checkMultiplicity(const std::vector<DatasetStats>& stats) {
  if (stats.size() < 2 || stats[0].eventsWritten == 0 || stats[1].eventsWritten == 0) {
    return kFALSE;
  }

  const Double_t ppPerEvent =
    static_cast<Double_t>(stats[0].tracks) / stats[0].eventsWritten;
  const Double_t pPbPerEvent =
    static_cast<Double_t>(stats[1].tracks) / stats[1].eventsWritten;

  std::cout << "\nMultiplicity check: pp " << ppPerEvent << " tracks/event, p-Pb "
            << pPbPerEvent << " tracks/event" << std::endl;

  if (pPbPerEvent <= ppPerEvent) {
    std::cerr << "ERROR: p-Pb multiplicity is not higher than pp. The input files are "
                 "probably swapped; fix kDatasets before shipping these assets."
              << std::endl;
    return kFALSE;
  }
  return kTRUE;
}

void reportDataset(const DatasetConfig& dataset, const DatasetStats& stats) {
  std::cout << "\n=== " << dataset.id << " ===" << std::endl;
  std::cout << "events            : " << stats.eventsWritten << std::endl;
  std::cout << "batches           : " << stats.batchesWritten << std::endl;
  std::cout << "tracks            : " << stats.tracks << std::endl;
  std::cout << "tracks per event  : "
            << (stats.eventsWritten > 0
                  ? static_cast<Double_t>(stats.tracks) / stats.eventsWritten
                  : 0.0)
            << std::endl;
  std::cout << "dE/dx min/max/mean: " << stats.dedxMin << " / " << stats.dedxMax << " / "
            << (stats.tracks > 0 ? stats.dedxSum / stats.tracks : 0.0) << std::endl;
  std::cout << "dE/dx == 0        : " << stats.zeroDedx << std::endl;
  std::cout << "sign +/-          : " << stats.positive << " / " << stats.negative
            << "  (other: " << stats.tracks - stats.positive - stats.negative << ")"
            << std::endl;
}

}  // namespace

void convert_events(TString inputDir = "vsd", TString outputDir = "../../src/assets/exercises/jpsi") {
  gSystem->mkdir(outputDir.Data(), kTRUE);

  std::vector<DatasetStats> allStats(kDatasets.size());

  for (std::size_t i = 0; i < kDatasets.size(); ++i) {
    std::cout << "Converting " << kDatasets[i].fileName << " as " << kDatasets[i].id
              << " ..." << std::endl;
    if (!convertDataset(kDatasets[i], inputDir, outputDir, allStats[i])) {
      std::cerr << "Conversion aborted." << std::endl;
      return;
    }
    reportDataset(kDatasets[i], allStats[i]);
  }

  if (!checkMultiplicity(allStats)) {
    std::cerr << "Manifest not written." << std::endl;
    return;
  }

  writeManifest(outputDir, allStats);
  std::cout << "\nWrote " << outputDir << "/manifest.json" << std::endl;
}
