// Diagnostic pass over an O2 AOD (AO2D.root) file before writing the real converter.
//
//   root -l -b -q inspect_ao2d.C
//   root -l -b -q 'inspect_ao2d.C("/path/to/AO2D.root")'
//
// Prints, per DF_* directory: the exact tree names (O2track / O2trackextra* /
// O2collision*), row-count agreement between O2track and O2trackextra, the number of
// collisions, and sample values of the branches the real converter will read
// (fSigned1Pt, fSnp, fAlpha, fTgl, fTPCSignal, fPosZ, TPC cluster count, fIndexCollisions
// range). Also fills global histograms of fTPCSignal and track multiplicity per event so
// we know before writing convert_ao2d_events.C whether the planned cuts make sense.

#include <TDirectory.h>
#include <TFile.h>
#include <TH1D.h>
#include <TKey.h>
#include <TLeaf.h>
#include <TList.h>
#include <TMath.h>
#include <TObjArray.h>
#include <TString.h>
#include <TTree.h>

#include <algorithm>
#include <cstdio>
#include <iostream>
#include <map>
#include <string>
#include <vector>

namespace {

void printSeparator(const char* title) {
  std::cout << "\n================================================================\n"
            << title << "\n"
            << "================================================================\n";
}

// Returns the single tree name in `dir` starting with `prefix`, or "" plus a printed
// warning if there is not exactly one match. This is the same lookup convert_ao2d_events.C
// must do per DF, because O2 versions the extra/collision tables (e.g. "_001", "_002").
std::string findUniqueTreeByPrefix(TDirectory* dir, const char* prefix) {
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
    std::cout << "  WARNING: expected exactly one tree starting with \"" << prefix
              << "\" in " << dir->GetName() << ", found " << matches.size() << ":";
    for (const auto& m : matches) {
      std::cout << " " << m;
    }
    std::cout << std::endl;
    return matches.empty() ? std::string() : matches.front();
  }
  return matches.front();
}

void listBranchesContaining(TTree* tree, const char* needle) {
  TObjArray* branches = tree->GetListOfBranches();
  for (Int_t i = 0; i < branches->GetEntries(); ++i) {
    TString name = branches->At(i)->GetName();
    if (name.Contains(needle, TString::kIgnoreCase)) {
      std::cout << "    " << name << std::endl;
    }
  }
}

}  // namespace

void inspect_ao2d(const char* path = "/home/szymon/Downloads/AO2D.root") {
  auto* file = TFile::Open(path);
  if (file == nullptr || file->IsZombie()) {
    std::cerr << "ERROR: cannot open " << path << std::endl;
    return;
  }

  printSeparator("Top-level keys");
  std::vector<TDirectory*> dfDirs;
  {
    TIter next(file->GetListOfKeys());
    TKey* key = nullptr;
    while ((key = dynamic_cast<TKey*>(next())) != nullptr) {
      TString name = key->GetName();
      TString className = key->GetClassName();
      std::cout << name << " [" << className << "]" << std::endl;
      if (name.BeginsWith("DF_") && className.Contains("Directory")) {
        dfDirs.push_back(dynamic_cast<TDirectory*>(key->ReadObj()));
      }
    }
  }
  std::cout << "\nFound " << dfDirs.size() << " DF_* directories." << std::endl;

  TH1D hTpcSignal("hTpcSignal", "fTPCSignal;ADC counts;tracks", 300, 0, 300);
  TH1D hTpcSignalWide("hTpcSignalWide", "fTPCSignal wide;ADC counts;tracks", 200, 0, 2000);
  TH1D hMultiplicity("hMultiplicity", "tracks per collision;tracks;collisions", 200, 0, 8000);
  TH1D hPosZ("hPosZ", "collision fPosZ;cm;collisions", 200, -50, 50);
  TH1D hNClsFound("hNClsFound", "TPC clusters found;clusters;tracks", 165, 0, 165);
  TH1D hMultiplicityPostCut("hMultiplicityPostCut", "tracks/collision after cuts;tracks;collisions",
                             200, 0, 2000);
  TH1D hPhiPos("hPhiPos", "phi sign>0;rad;tracks", 60, -TMath::Pi(), TMath::Pi());
  TH1D hPhiNeg("hPhiNeg", "phi sign<0;rad;tracks", 60, -TMath::Pi(), TMath::Pi());
  TH1D hPtCheckDiff("hPtCheckDiff", "sqrt(px^2+py^2) - 1/|fSigned1Pt|;GeV/c;tracks", 100, -0.01,
                     0.01);

  Long64_t totalCollisions = 0;
  Long64_t totalTracks = 0;
  Long64_t totalTracksAssigned = 0;
  Long64_t totalTracksUnassigned = 0;
  Long64_t nanSigned1Pt = 0;
  Long64_t nanTpcSignal = 0;
  Long64_t tpcSignalAbove2000 = 0;
  Long64_t tracksPassingAllCuts = 0;

  // Same threshold the real converter will use; kept as one constant here too so the
  // "post-cut" estimate in this diagnostic matches what convert_ao2d_events.C will do.
  const Double_t kMinTpcClusters = 70.0;
  const Double_t kMinP = 0.1;
  const Double_t kMaxP = 10.0;
  const Double_t kMaxDedx = 2000.0;

  std::map<std::string, int> extraNameCounts;
  std::map<std::string, int> collisionNameCounts;

  const int kMaxDfPrinted = 3;

  for (std::size_t dfIndex = 0; dfIndex < dfDirs.size(); ++dfIndex) {
    TDirectory* df = dfDirs[dfIndex];
    const bool verbose = static_cast<int>(dfIndex) < kMaxDfPrinted;

    if (verbose) {
      printSeparator(Form("DF #%zu: %s", dfIndex, df->GetName()));
    }

    const std::string trackExtraName = findUniqueTreeByPrefix(df, "O2trackextra");
    const std::string collisionName = findUniqueTreeByPrefix(df, "O2collision");
    extraNameCounts[trackExtraName]++;
    collisionNameCounts[collisionName]++;

    auto* track = dynamic_cast<TTree*>(df->Get("O2track"));
    auto* extra =
      trackExtraName.empty() ? nullptr : dynamic_cast<TTree*>(df->Get(trackExtraName.c_str()));
    auto* coll =
      collisionName.empty() ? nullptr : dynamic_cast<TTree*>(df->Get(collisionName.c_str()));

    if (track == nullptr || extra == nullptr || coll == nullptr) {
      std::cout << "  WARNING: missing O2track/O2trackextra/O2collision in "
                << df->GetName() << " — skipping." << std::endl;
      continue;
    }

    const Long64_t nTrack = track->GetEntries();
    const Long64_t nExtra = extra->GetEntries();
    const Long64_t nColl = coll->GetEntries();

    if (verbose) {
      std::cout << "  O2track entries        = " << nTrack << std::endl;
      std::cout << "  " << trackExtraName << " entries = " << nExtra << std::endl;
      std::cout << "  " << collisionName << " entries  = " << nColl << std::endl;
      if (nTrack != nExtra) {
        std::cout << "  WARNING: O2track and O2trackextra row counts differ!" << std::endl;
      }
      std::cout << "  O2trackextra branches containing \"TPC\" or \"Signal\":" << std::endl;
      listBranchesContaining(extra, "TPC");
      std::cout << "  O2collision branches containing \"PosZ\" or \"Vtx\":" << std::endl;
      listBranchesContaining(coll, "Pos");
    }

    totalCollisions += nColl;
    totalTracks += nTrack;

    // Sample values from the first few tracks of this DF.
    Float_t signed1Pt = 0, snp = 0, alpha = 0, tgl = 0;
    Int_t indexCollisions = -1;
    track->SetBranchAddress("fSigned1Pt", &signed1Pt);
    track->SetBranchAddress("fSnp", &snp);
    track->SetBranchAddress("fAlpha", &alpha);
    track->SetBranchAddress("fTgl", &tgl);
    if (track->GetBranch("fIndexCollisions") != nullptr) {
      track->SetBranchAddress("fIndexCollisions", &indexCollisions);
    }

    Float_t tpcSignal = 0;
    extra->SetBranchAddress("fTPCSignal", &tpcSignal);

    // O2 AOD stores the cluster count as a base value plus small signed differences to
    // save space; the actual number of clusters used for dE/dx is Findable minus the
    // "minus found" delta. Both branches are typically Int8/Float depending on schema
    // version, so read via TLeaf to stay agnostic of the exact type.
    TLeaf* findableLeaf = extra->GetLeaf("fTPCNClsFindable");
    TLeaf* minusFoundLeaf = extra->GetLeaf("fTPCNClsFindableMinusFound");

    Float_t posZ = 0;
    if (coll->GetBranch("fPosZ") != nullptr) {
      coll->SetBranchAddress("fPosZ", &posZ);
    }

    if (verbose) {
      std::cout << "  Sample tracks (first 5):" << std::endl;
      std::printf("    %-4s %-12s %-10s %-10s %-10s %-12s %-10s\n", "i", "fSigned1Pt", "fSnp",
                  "fAlpha", "fTgl", "fTPCSignal", "collIdx");
    }
    for (Long64_t i = 0; i < std::min<Long64_t>(5, nTrack); ++i) {
      track->GetEntry(i);
      extra->GetEntry(i);
      if (verbose) {
        std::printf("    %-4lld %-12.5f %-10.5f %-10.5f %-10.5f %-12.2f %-10d\n",
                    static_cast<long long>(i), signed1Pt, snp, alpha, tgl, tpcSignal,
                    indexCollisions);
      }
    }

    // Fill histograms + count assigned/unassigned tracks over the full DF.
    std::vector<Long64_t> perCollision(nColl > 0 ? nColl : 0, 0);
    std::vector<Long64_t> perCollisionPostCut(nColl > 0 ? nColl : 0, 0);
    for (Long64_t i = 0; i < nTrack; ++i) {
      track->GetEntry(i);
      extra->GetEntry(i);

      if (std::isnan(static_cast<double>(signed1Pt))) {
        nanSigned1Pt++;
      }
      if (std::isnan(static_cast<double>(tpcSignal))) {
        nanTpcSignal++;
      } else {
        hTpcSignal.Fill(tpcSignal);
        hTpcSignalWide.Fill(tpcSignal);
        if (tpcSignal >= 2000) {
          tpcSignalAbove2000++;
        }
      }

      Double_t nClsFound = -1.0;
      if (findableLeaf != nullptr && minusFoundLeaf != nullptr) {
        nClsFound = findableLeaf->GetValue() - minusFoundLeaf->GetValue();
        hNClsFound.Fill(nClsFound);
      }

      if (indexCollisions >= 0 && indexCollisions < nColl) {
        perCollision[indexCollisions]++;
        totalTracksAssigned++;
      } else {
        totalTracksUnassigned++;
      }

      // --- Same reconstruction + cuts convert_ao2d_events.C will apply ------------
      const Double_t absQPt = TMath::Abs(static_cast<Double_t>(signed1Pt));
      if (absQPt < 1e-9) {
        continue;  // NaN or zero pt falls here too (NaN comparisons are false, so this
                   // branch is only taken for the explicit zero case; NaN tracks fall
                   // through to the isnan-driven p-range rejection below)
      }
      Double_t snpClamped = static_cast<Double_t>(snp);
      if (snpClamped > 1.0) snpClamped = 1.0;
      if (snpClamped < -1.0) snpClamped = -1.0;
      const Double_t pt = 1.0 / absQPt;
      const Int_t trackSign = (signed1Pt > 0) ? 1 : -1;
      const Double_t phi = TMath::ASin(snpClamped) + static_cast<Double_t>(alpha);
      const Double_t px = pt * TMath::Cos(phi);
      const Double_t py = pt * TMath::Sin(phi);
      const Double_t pz = pt * static_cast<Double_t>(tgl);
      const Double_t p = TMath::Sqrt(px * px + py * py + pz * pz);

      if (std::isnan(p) || p < kMinP || p > kMaxP) {
        continue;
      }
      if (std::isnan(static_cast<double>(tpcSignal)) || tpcSignal <= 0 ||
          tpcSignal >= kMaxDedx) {
        continue;
      }
      if (nClsFound < kMinTpcClusters) {
        continue;
      }

      tracksPassingAllCuts++;
      if (indexCollisions >= 0 && indexCollisions < nColl) {
        perCollisionPostCut[indexCollisions]++;
      }
      if (trackSign > 0) {
        hPhiPos.Fill(TMath::ATan2(py, px));
      } else {
        hPhiNeg.Fill(TMath::ATan2(py, px));
      }
      hPtCheckDiff.Fill(TMath::Sqrt(px * px + py * py) - pt);
    }
    for (Long64_t c = 0; c < nColl; ++c) {
      hMultiplicity.Fill(static_cast<Double_t>(perCollision[c]));
      hMultiplicityPostCut.Fill(static_cast<Double_t>(perCollisionPostCut[c]));
    }
    if (coll->GetBranch("fPosZ") != nullptr) {
      for (Long64_t c = 0; c < nColl; ++c) {
        coll->GetEntry(c);
        hPosZ.Fill(posZ);
      }
    }
  }

  printSeparator("Tree naming summary (to confirm versioning across DFs)");
  std::cout << "O2trackextra* names seen:" << std::endl;
  for (const auto& kv : extraNameCounts) {
    std::cout << "  " << kv.first << " : " << kv.second << " DF(s)" << std::endl;
  }
  std::cout << "O2collision* names seen:" << std::endl;
  for (const auto& kv : collisionNameCounts) {
    std::cout << "  " << kv.first << " : " << kv.second << " DF(s)" << std::endl;
  }

  printSeparator("Totals");
  std::cout << "DF_* directories       : " << dfDirs.size() << std::endl;
  std::cout << "Total collisions       : " << totalCollisions << std::endl;
  std::cout << "Total tracks (O2track) : " << totalTracks << std::endl;
  std::cout << "Tracks with valid collision index : " << totalTracksAssigned << std::endl;
  std::cout << "Tracks with NO valid collision index (skipped by converter) : "
            << totalTracksUnassigned << std::endl;
  if (totalCollisions > 0) {
    std::cout << "Mean tracks / collision : "
              << static_cast<double>(totalTracksAssigned) / static_cast<double>(totalCollisions)
              << std::endl;
  }

  printSeparator("fTPCSignal distribution (should resemble dE/dx, mean roughly tens)");
  std::cout << "NaN fSigned1Pt tracks : " << nanSigned1Pt << " / " << totalTracks << std::endl;
  std::cout << "NaN fTPCSignal tracks : " << nanTpcSignal << " / " << totalTracks << std::endl;
  std::cout << "fTPCSignal >= 2000 (excluded by planned cut) : " << tpcSignalAbove2000
            << std::endl;
  std::cout << "mean (0-300 range) = " << hTpcSignal.GetMean()
            << "  rms = " << hTpcSignal.GetRMS()
            << "  overflow (>=300) = " << hTpcSignal.GetBinContent(hTpcSignal.GetNbinsX() + 1)
            << std::endl;
  for (int i = 1; i <= hTpcSignal.GetNbinsX(); i += 20) {
    std::printf("  [%3.0f-%3.0f) : %.0f\n", hTpcSignal.GetBinLowEdge(i),
                hTpcSignal.GetBinLowEdge(i) + 20 * hTpcSignal.GetBinWidth(i),
                hTpcSignal.Integral(i, std::min(i + 19, hTpcSignal.GetNbinsX())));
  }
  std::cout << "\nWide range (0-2000, step 100):" << std::endl;
  for (int i = 1; i <= hTpcSignalWide.GetNbinsX(); i += 10) {
    std::printf("  [%4.0f-%4.0f) : %.0f\n", hTpcSignalWide.GetBinLowEdge(i),
                hTpcSignalWide.GetBinLowEdge(i) + 10 * hTpcSignalWide.GetBinWidth(i),
                hTpcSignalWide.Integral(i, std::min(i + 9, hTpcSignalWide.GetNbinsX())));
  }
  std::cout << "wide-range overflow (fTPCSignal >= 2000, excluding NaN) = "
            << hTpcSignalWide.GetBinContent(hTpcSignalWide.GetNbinsX() + 1) << std::endl;

  printSeparator("TPC clusters found = fTPCNClsFindable - fTPCNClsFindableMinusFound");
  std::cout << "mean = " << hNClsFound.GetMean() << "  rms = " << hNClsFound.GetRMS()
            << std::endl;
  const Double_t atLeast70 = hNClsFound.Integral(hNClsFound.FindBin(70.0), hNClsFound.GetNbinsX());
  std::cout << "fraction with >= 70 clusters : "
            << (totalTracks > 0 ? atLeast70 / static_cast<double>(totalTracks) : 0.0)
            << std::endl;

  printSeparator("Track multiplicity per collision (raw, before any cuts)");
  std::cout << "mean = " << hMultiplicity.GetMean() << "  rms = " << hMultiplicity.GetRMS()
            << std::endl;

  printSeparator("Track multiplicity per collision AFTER all planned cuts (vertex cut not "
                  "applied here, only track-level cuts)");
  std::cout << "tracks passing all cuts : " << tracksPassingAllCuts << " / " << totalTracks
            << std::endl;
  std::cout << "mean tracks/collision (post-cut) = " << hMultiplicityPostCut.GetMean()
            << "  rms = " << hMultiplicityPostCut.GetRMS() << std::endl;
  std::cout << "Projected size for 1000 events: ~"
            << static_cast<Long64_t>(hMultiplicityPostCut.GetMean() * 1000)
            << " tracks total (6 Double/Int columns + trackOffsets)" << std::endl;

  printSeparator("Momentum formula sanity check (Walidacja step 2)");
  std::cout << "pt consistency sqrt(px^2+py^2) - 1/|fSigned1Pt|: mean = "
            << hPtCheckDiff.GetMean() << "  rms = " << hPtCheckDiff.GetRMS()
            << "  (should be ~0, confirms the trig arithmetic)" << std::endl;
  std::cout << "\nphi = atan2(py,px) distribution, should be flat and NOT shifted between "
               "sign>0 and sign<0 (a shift means the pt sign convention is wrong):"
            << std::endl;
  std::printf("  %-20s %-12s %-12s\n", "bin center (rad)", "sign>0", "sign<0");
  for (int i = 1; i <= hPhiPos.GetNbinsX(); i += 6) {
    std::printf("  %-20.2f %-12.0f %-12.0f\n", hPhiPos.GetBinCenter(i),
                hPhiPos.Integral(i, std::min(i + 5, hPhiPos.GetNbinsX())),
                hPhiNeg.Integral(i, std::min(i + 5, hPhiNeg.GetNbinsX())));
  }
  std::cout << "phi>0 entries=" << hPhiPos.GetEntries()
            << " mean=" << hPhiPos.GetMean() << " | phi<0 entries=" << hPhiNeg.GetEntries()
            << " mean=" << hPhiNeg.GetMean() << std::endl;

  printSeparator("Collision fPosZ distribution (vertex cut sanity)");
  std::cout << "mean = " << hPosZ.GetMean() << "  rms = " << hPosZ.GetRMS() << std::endl;
  const Double_t withinTenCm =
    hPosZ.Integral(hPosZ.FindBin(-10.0), hPosZ.FindBin(10.0));
  std::cout << "fraction with |fPosZ| < 10 cm : "
            << (totalCollisions > 0 ? withinTenCm / static_cast<double>(totalCollisions) : 0.0)
            << std::endl;

  file->Close();
}
