// Converts an O2 AOD (AO2D.root, e.g. opendata.cern.ch/record/11537, LHC15o Pb-Pb) into
// the same PID-only columnar JSON batches that data/jpsi/convert_events.C produces from
// the legacy VSD files, but for the Pb-Pb dataset ("pbPb").
//
//   root -l -b -q convert_ao2d_events.C
//   root -l -b -q 'convert_ao2d_events.C("/path/to/AO2D.root", "../../src/assets/exercises/jpsi")'
//
// AO2D is a completely different format from the VSD used by convert_events.C (TTree
// tables O2track / O2trackextra_* / O2collision_* inside per-timeframe "DF_*" folders,
// not TEveVSD directories), so this is a separate macro rather than a code path inside
// convert_events.C. Only the JSON-writing layer (BatchBuffer, formatNumber, writeBatch)
// is shared in spirit; see data/jpsi/README.md for the full field mapping and the reasons
// for every cut below.
//
// Unlike convert_events.C, this macro does NOT touch manifest.json: appending a single
// dataset entry into that file with hand-rolled JSON text in a ROOT macro would be more
// fragile than the value it adds (see README.md). Instead it prints the manifest
// fragment to stdout; add it to manifest.json by hand.

#include <TDirectory.h>
#include <TFile.h>
#include <TKey.h>
#include <TLeaf.h>
#include <TMath.h>
#include <TString.h>
#include <TSystem.h>
#include <TTree.h>

#include <cmath>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

namespace {

constexpr Int_t kBatchSize = 100;
// Multiple of kBatchSize. The file has 1408 collisions total; 1400 uses essentially all
// of them (see README.md "Walidacja fizyki" for why this is not a round 1000 -- the
// unlike/like-sign excess around the J/psi window is only ~3 sigma even at full
// statistics, so every extra event helps and there is no reason to leave some unused).
constexpr Int_t kTrimTo = 1400;
const char* const kDatasetId = "pbPb";
const char* const kLabelKey = "JPSI.DATASET.PBPB";

// --- Cuts (see README.md "Obowiązkowe cuty" / plan for the physics justification) -----
constexpr Double_t kMaxVertexZ = 10.0;        // cm, |fPosZ| from O2collision
constexpr Double_t kMinAbsQPt = 1e-9;         // guards 1/|fSigned1Pt| against division by ~0
constexpr Double_t kMinP = 0.1;               // GeV/c, matches PID_P_MIN in jpsi.models.ts
constexpr Double_t kMaxP = 10.0;              // GeV/c, matches PID_P_MAX in jpsi.models.ts
constexpr Double_t kMinDedx = 0.0;            // exclusive: fTPCSignal must be > this
constexpr Double_t kMaxDedx = 2000.0;         // exclusive upper bound
// 70 clusters (out of up to ~159 TPC pad rows) is the plan's original starting threshold.
// A stricter cut (120) was tried to shrink assets, but it measurably *hurt* the
// unlike-minus-like-sign excess in the J/psi window (see README.md "Walidacja fizyki":
// 2.84 sigma at 120 clusters vs 3.25 sigma at 70 clusters on the same 1000 events) --
// consistent with the plan's own risk note that an overly strict TPC-quality cut throws
// away real electrons disproportionately. Kept at 70; batch sizes stay within the
// documented 5-10 MB/batch ceiling (see README.md).
constexpr Double_t kMinTpcClusters = 70.0;    // fTPCNClsFindable - fTPCNClsFindableMinusFound

// --- Shared JSON-writing layer (mirrors convert_events.C exactly) ---------------------

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

// Rounds to four decimals and drops trailing zeros, so 0.1200 becomes 0.12. Keeps the
// assets small without a JSON library — same convention as convert_events.C.
std::string formatNumber(Double_t value) {
  Double_t rounded = std::round(value * 10000.0) / 10000.0;
  if (rounded == 0.0) {
    return "0";
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

Bool_t writeBatch(const std::string& directory, Int_t batchIndex, Int_t firstEventIndex,
                   const BatchBuffer& batch) {
  char name[64];
  std::snprintf(name, sizeof(name), "/batch_%03d.json", batchIndex);
  const std::string path = directory + name;

  std::ofstream out(path);
  if (!out.is_open()) {
    std::cerr << "ERROR: cannot write " << path << std::endl;
    return kFALSE;
  }

  out << "{";
  out << "\"datasetId\":\"" << kDatasetId << "\",";
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

// --- AO2D-specific reading layer -------------------------------------------------------

struct ConversionStats {
  Int_t eventsWritten = 0;
  Int_t batchesWritten = 0;
  Int_t emptyEventsVertexCut = 0;
  Long64_t tracksSeen = 0;
  Long64_t tracksNoCollision = 0;
  Long64_t tracksPassingCuts = 0;
  Long64_t positive = 0;
  Long64_t negative = 0;
  Double_t dedxMin = 1e30;
  Double_t dedxMax = -1e30;
  Double_t dedxSum = 0.0;
};

// Finds the single tree in `dir` whose name starts with `prefix`. AO2D versions the
// per-timeframe extra/collision tables (e.g. "_001" vs "_002"), so the name cannot be
// hardcoded — but exactly one match is required, otherwise the DF has an unexpected
// schema and we must not silently guess.
Bool_t findUniqueTreeByPrefix(TDirectory* dir, const char* prefix, std::string& outName) {
  std::vector<std::string> matches;
  TIter next(dir->GetListOfKeys());
  TKey* key = nullptr;
  while ((key = dynamic_cast<TKey*>(next())) != nullptr) {
    TString className = key->GetClassName();
    if (!className.Contains("TTree")) {
      continue;
    }
    TString name = key->GetName();
    if (name.BeginsWith(prefix)) {
      matches.push_back(name.Data());
    }
  }
  if (matches.size() != 1) {
    std::cerr << "ERROR: expected exactly one tree starting with \"" << prefix << "\" in "
              << dir->GetName() << ", found " << matches.size() << "." << std::endl;
    return kFALSE;
  }
  outName = matches.front();
  return kTRUE;
}

// Collects the DF_* directory keys in file order (skips "metaData" and anything else).
void collectDfKeys(TFile* file, std::vector<TDirectory*>& dfDirs) {
  TIter next(file->GetListOfKeys());
  TKey* key = nullptr;
  while ((key = dynamic_cast<TKey*>(next())) != nullptr) {
    TString name = key->GetName();
    TString className = key->GetClassName();
    if (name.BeginsWith("DF_") && className.Contains("Directory")) {
      dfDirs.push_back(dynamic_cast<TDirectory*>(key->ReadObj()));
    }
  }
}

Bool_t convertAO2D(const TString& inputPath, const TString& outputDir, ConversionStats& stats) {
  auto* file = TFile::Open(inputPath);
  if (file == nullptr || file->IsZombie()) {
    std::cerr << "ERROR: cannot open " << inputPath << "\n"
              << "       See data/jpsi/README.md for how to obtain the AO2D file."
              << std::endl;
    return kFALSE;
  }

  std::vector<TDirectory*> dfDirs;
  collectDfKeys(file, dfDirs);
  if (dfDirs.empty()) {
    std::cerr << "ERROR: no DF_* directories found in " << inputPath << std::endl;
    return kFALSE;
  }

  const std::string datasetDir = std::string(outputDir.Data()) + "/" + kDatasetId;
  gSystem->mkdir(datasetDir.c_str(), kTRUE);

  BatchBuffer batch;
  Int_t batchIndex = 0;
  Int_t globalEvent = 0;
  Bool_t done = kFALSE;

  for (std::size_t dfIndex = 0; dfIndex < dfDirs.size() && !done; ++dfIndex) {
    TDirectory* df = dfDirs[dfIndex];

    std::string trackExtraName;
    std::string collisionName;
    if (!findUniqueTreeByPrefix(df, "O2trackextra", trackExtraName) ||
        !findUniqueTreeByPrefix(df, "O2collision", collisionName)) {
      file->Close();
      return kFALSE;
    }

    auto* track = dynamic_cast<TTree*>(df->Get("O2track"));
    auto* extra = dynamic_cast<TTree*>(df->Get(trackExtraName.c_str()));
    auto* coll = dynamic_cast<TTree*>(df->Get(collisionName.c_str()));
    if (track == nullptr || extra == nullptr || coll == nullptr) {
      std::cerr << "ERROR: " << df->GetName()
                << " is missing O2track/O2trackextra*/O2collision*." << std::endl;
      file->Close();
      return kFALSE;
    }

    const Long64_t nTrack = track->GetEntries();
    if (nTrack != extra->GetEntries()) {
      std::cerr << "ERROR: " << df->GetName() << ": O2track has " << nTrack
                << " rows but " << trackExtraName << " has " << extra->GetEntries()
                << ". They must be row-aligned." << std::endl;
      file->Close();
      return kFALSE;
    }
    const Long64_t nCollisions = coll->GetEntries();

    Float_t signed1Pt = 0, snp = 0, alpha = 0, tgl = 0;
    Int_t indexCollisions = -1;
    track->SetBranchAddress("fSigned1Pt", &signed1Pt);
    track->SetBranchAddress("fSnp", &snp);
    track->SetBranchAddress("fAlpha", &alpha);
    track->SetBranchAddress("fTgl", &tgl);
    track->SetBranchAddress("fIndexCollisions", &indexCollisions);

    Float_t tpcSignal = 0;
    extra->SetBranchAddress("fTPCSignal", &tpcSignal);
    // Cluster count is stored as findable minus a signed "minus found" delta (O2 AOD
    // compression trick); read both through TLeaf so the exact underlying integer width
    // does not matter.
    TLeaf* findableLeaf = extra->GetLeaf("fTPCNClsFindable");
    TLeaf* minusFoundLeaf = extra->GetLeaf("fTPCNClsFindableMinusFound");
    if (findableLeaf == nullptr || minusFoundLeaf == nullptr) {
      std::cerr << "ERROR: " << trackExtraName
                << " is missing fTPCNClsFindable / fTPCNClsFindableMinusFound." << std::endl;
      file->Close();
      return kFALSE;
    }

    Float_t posZ = 0;
    coll->SetBranchAddress("fPosZ", &posZ);

    // Bucket track row indices by their local collision index in one pass, so the
    // per-collision loop below does not have to scan all nTrack rows per collision.
    std::vector<std::vector<Long64_t>> tracksByCollision(
      nCollisions > 0 ? static_cast<std::size_t>(nCollisions) : 0);
    for (Long64_t i = 0; i < nTrack; ++i) {
      track->GetEntry(i);
      stats.tracksSeen++;
      if (indexCollisions >= 0 && indexCollisions < nCollisions) {
        tracksByCollision[static_cast<std::size_t>(indexCollisions)].push_back(i);
      } else {
        stats.tracksNoCollision++;
      }
    }

    for (Long64_t collIndex = 0; collIndex < nCollisions; ++collIndex) {
      if (globalEvent >= kTrimTo) {
        done = kTRUE;
        break;
      }

      coll->GetEntry(collIndex);
      const Bool_t vertexOk = TMath::Abs(static_cast<Double_t>(posZ)) < kMaxVertexZ;
      if (!vertexOk) {
        stats.emptyEventsVertexCut++;
      } else {
        for (Long64_t trackRow : tracksByCollision[static_cast<std::size_t>(collIndex)]) {
          track->GetEntry(trackRow);
          extra->GetEntry(trackRow);

          const Double_t absQPt = TMath::Abs(static_cast<Double_t>(signed1Pt));
          if (absQPt < kMinAbsQPt) {
            continue;
          }
          Double_t snpClamped = static_cast<Double_t>(snp);
          if (snpClamped > 1.0) snpClamped = 1.0;
          if (snpClamped < -1.0) snpClamped = -1.0;

          const Double_t pt = 1.0 / absQPt;  // unsigned, matches O2 getPt() convention
          const Int_t trackSign = (signed1Pt > 0) ? 1 : -1;
          const Double_t phi = TMath::ASin(snpClamped) + static_cast<Double_t>(alpha);
          const Double_t trackPx = pt * TMath::Cos(phi);
          const Double_t trackPy = pt * TMath::Sin(phi);
          const Double_t trackPz = pt * static_cast<Double_t>(tgl);
          const Double_t momentum =
            TMath::Sqrt(trackPx * trackPx + trackPy * trackPy + trackPz * trackPz);

          if (std::isnan(momentum) || momentum < kMinP || momentum > kMaxP) {
            continue;
          }

          const Double_t trackDedx = static_cast<Double_t>(tpcSignal);
          if (std::isnan(trackDedx) || trackDedx <= kMinDedx || trackDedx >= kMaxDedx) {
            continue;
          }

          const Double_t nClsFound = findableLeaf->GetValue() - minusFoundLeaf->GetValue();
          if (nClsFound < kMinTpcClusters) {
            continue;
          }

          batch.px.push_back(trackPx);
          batch.py.push_back(trackPy);
          batch.pz.push_back(trackPz);
          batch.p.push_back(momentum);
          batch.dedx.push_back(trackDedx);
          batch.sign.push_back(trackSign);

          stats.tracksPassingCuts++;
          if (trackSign > 0) {
            stats.positive++;
          } else {
            stats.negative++;
          }
          stats.dedxMin = TMath::Min(stats.dedxMin, trackDedx);
          stats.dedxMax = TMath::Max(stats.dedxMax, trackDedx);
          stats.dedxSum += trackDedx;
        }
      }

      // Close the event even when it contributed zero tracks (vertex cut or all tracks
      // failed quality cuts): batch numbering must stay in sync with kBatchSize, exactly
      // like convert_events.C does for VSD events with few or no reconstructed tracks.
      batch.trackOffsets.push_back(static_cast<Int_t>(batch.px.size()));
      ++batch.eventCount;
      ++globalEvent;

      if (batch.eventCount == kBatchSize) {
        const Int_t firstEventIndex = batchIndex * kBatchSize;
        if (!writeBatch(datasetDir, batchIndex, firstEventIndex, batch)) {
          file->Close();
          return kFALSE;
        }
        ++batchIndex;
        stats.eventsWritten += batch.eventCount;
        batch.clear();
      }
    }
  }

  // kTrimTo is a multiple of kBatchSize, but the file may hold fewer usable events than
  // requested; flush whatever is left so no partially-filled batch is silently dropped.
  if (batch.eventCount > 0) {
    const Int_t firstEventIndex = batchIndex * kBatchSize;
    if (!writeBatch(datasetDir, batchIndex, firstEventIndex, batch)) {
      file->Close();
      return kFALSE;
    }
    ++batchIndex;
    stats.eventsWritten += batch.eventCount;
  }

  stats.batchesWritten = batchIndex;
  file->Close();
  return kTRUE;
}

void reportStats(const ConversionStats& stats) {
  std::cout << "\n=== " << kDatasetId << " ===" << std::endl;
  std::cout << "events written        : " << stats.eventsWritten << std::endl;
  std::cout << "batches written       : " << stats.batchesWritten << std::endl;
  std::cout << "empty events (vertex) : " << stats.emptyEventsVertexCut << std::endl;
  std::cout << "tracks seen (raw)     : " << stats.tracksSeen << std::endl;
  std::cout << "tracks w/o collision  : " << stats.tracksNoCollision << std::endl;
  std::cout << "tracks passing cuts   : " << stats.tracksPassingCuts << std::endl;
  std::cout << "tracks per event      : "
            << (stats.eventsWritten > 0
                  ? static_cast<Double_t>(stats.tracksPassingCuts) / stats.eventsWritten
                  : 0.0)
            << std::endl;
  std::cout << "dE/dx min/max/mean    : " << stats.dedxMin << " / " << stats.dedxMax << " / "
            << (stats.tracksPassingCuts > 0 ? stats.dedxSum / stats.tracksPassingCuts : 0.0)
            << std::endl;
  std::cout << "sign +/-              : " << stats.positive << " / " << stats.negative
            << std::endl;
}

void printManifestFragment(const ConversionStats& stats) {
  std::cout << "\nAdd this to the \"datasets\" array in "
               "src/assets/exercises/jpsi/manifest.json:\n"
            << "{ \"id\": \"" << kDatasetId << "\", \"labelKey\": \"" << kLabelKey
            << "\", \"nEvents\": " << stats.eventsWritten
            << ", \"batches\": " << stats.batchesWritten << " }" << std::endl;
}

}  // namespace

void convert_ao2d_events(TString inputPath = "/home/szymon/Downloads/AO2D.root",
                          TString outputDir = "../../src/assets/exercises/jpsi") {
  gSystem->mkdir(outputDir.Data(), kTRUE);

  ConversionStats stats;
  std::cout << "Converting " << inputPath << " as " << kDatasetId << " (trimTo=" << kTrimTo
            << ") ..." << std::endl;

  if (!convertAO2D(inputPath, outputDir, stats)) {
    std::cerr << "Conversion aborted." << std::endl;
    return;
  }

  reportStats(stats);
  printManifestFragment(stats);
}
