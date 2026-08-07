// Diagnostic macro: reports event count, track multiplicity and dE/dx range for a
// J/psi VSD file. Used to decide which input file is pp and which is p-Pb before
// running convert_events.C, and to confirm that dE/dx really is stored in fStatus.
//
//   root -l -b -q 'inspect_vsd.C("vsd/events_0.root")'

#include <TDirectory.h>
#include <TEveVSD.h>
#include <TFile.h>
#include <TKey.h>
#include <TObjArray.h>
#include <TPRegexp.h>

#include <iostream>

void inspect_vsd(TString path) {
  auto* file = TFile::Open(path);
  if (file == nullptr || file->IsZombie()) {
    std::cerr << "ERROR: cannot open " << path << std::endl;
    return;
  }

  TObjArray eventKeys;
  TPMERegexp nameRe("Event\\d+");
  TObjLink* link = file->GetListOfKeys()->FirstLink();
  while (link != nullptr) {
    if (nameRe.Match(link->GetObject()->GetName()) != 0) {
      eventKeys.Add(link->GetObject());
    }
    link = link->Next();
  }

  const Int_t nEvents = eventKeys.GetEntries();

  auto* vsd = new TEveVSD();

  Long64_t totalTracks = 0;
  Long64_t nPos = 0;
  Long64_t nNeg = 0;
  Long64_t nZeroDedx = 0;
  Double_t dedxMin = 1e30;
  Double_t dedxMax = -1e30;
  Double_t dedxSum = 0.0;
  Double_t pMin = 1e30;
  Double_t pMax = -1e30;
  Int_t maxTracksInEvent = 0;

  for (Int_t i = 0; i < nEvents; ++i) {
    auto* key = dynamic_cast<TKey*>(eventKeys.At(i));
    auto* directory = dynamic_cast<TDirectory*>(key->ReadObj());

    vsd->SetDirectory(directory);
    vsd->LoadTrees();
    vsd->SetBranchAddresses();

    if (vsd->fTreeR == nullptr) {
      continue;
    }

    const Int_t nTracks = vsd->fTreeR->GetEntries();
    totalTracks += nTracks;
    if (nTracks > maxTracksInEvent) {
      maxTracksInEvent = nTracks;
    }

    for (Int_t t = 0; t < nTracks; ++t) {
      vsd->fTreeR->GetEntry(t);

      const Double_t dedx = vsd->fR.fStatus;
      const Double_t px = vsd->fR.fP.fX;
      const Double_t py = vsd->fR.fP.fY;
      const Double_t pz = vsd->fR.fP.fZ;
      const Double_t p = TMath::Sqrt(px * px + py * py + pz * pz);

      if (dedx == 0.0) {
        ++nZeroDedx;
      }
      dedxMin = TMath::Min(dedxMin, dedx);
      dedxMax = TMath::Max(dedxMax, dedx);
      dedxSum += dedx;

      pMin = TMath::Min(pMin, p);
      pMax = TMath::Max(pMax, p);

      if (vsd->fR.fSign > 0) {
        ++nPos;
      } else if (vsd->fR.fSign < 0) {
        ++nNeg;
      }
    }
  }

  std::cout << "\n=== " << path << " ===" << std::endl;
  std::cout << "events            : " << nEvents << std::endl;
  std::cout << "tracks total      : " << totalTracks << std::endl;
  std::cout << "tracks per event  : "
            << (nEvents > 0 ? static_cast<Double_t>(totalTracks) / nEvents : 0.0)
            << "  (max " << maxTracksInEvent << ")" << std::endl;
  std::cout << "dE/dx min/max/mean: " << dedxMin << " / " << dedxMax << " / "
            << (totalTracks > 0 ? dedxSum / totalTracks : 0.0) << std::endl;
  std::cout << "dE/dx == 0        : " << nZeroDedx << std::endl;
  std::cout << "p min/max         : " << pMin << " / " << pMax << std::endl;
  std::cout << "sign +/-          : " << nPos << " / " << nNeg << std::endl;
}
