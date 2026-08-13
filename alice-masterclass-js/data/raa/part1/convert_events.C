// Adapted from data/strangeness/part1/convert_events.C for the Raa (nuclear
// modification factor) exercise 1 datasets.
//
// Differences vs. the Strangeness converter:
//  - Input files are named "AliVSD_MasterClass_<N>.root" for N = 1..10 (not
//    0..20), so the file-name loop is parametrised accordingly.
//  - Output files are named "event_<datasetId>_<realEventNumber>.json",
//    using the *actual* event number found in the ROOT directory name
//    (e.g. "Event0159" -> 159) instead of a synthetic sequential index.
//    This preserves traceability back to the source data and lets a
//    separate post-processing step classify pp vs Pb-Pb events by
//    multiplicity instead of by position.
//  - track_to_json / load_tracks now preserve the desktop primary-track flag:
//    Utility::VSDReader::handleTrack marks a track primary iff
//    Abs(fDcaXY) < 0.5 cm && Abs(fDcaZ) < 1.0 cm (HelperPrimaryTracks bit 1<<14).
//    JSON gets isPrimary + type STANDARD (0) or SECONDARY (4). Raa has no
//    RecV0s/Hits, so load_v0s / load_cascades are no-ops there.
#include "json.hpp"
#include <TEveVSD.h>
#include <TDatabasePDG.h>
#include <TEveTrack.h>
#include <TEveTrackPropagator.h>
#include <vector>

using json = nlohmann::json;

TEveTrackPropagator* trkProp;
TDatabasePDG* database;

// Pb-Pb central events can have >2M reconstructed clusters, which blows up
// to 100+ MB of JSON and is unusable in the browser. Cap the total number
// of clusters per event by taking every Nth point (stride = ceil(total /
// gMaxClusters)), matching the downsampling already used for the production
// showcase events (event0118/159/179.json), which this constant reproduces
// exactly.
Int_t gMaxClusters = 25000;

typedef enum TrackType {
  STANDARD = 0,
  V0 = 1,
  CASCADE = 2,
  CASCADE_BACHELOR = 3,
  // RAA secondary (non-primary) — same role as tracks that fail the desktop
  // VSDReader::handleTrack DCA cut and therefore never get MarkPrimary().
  SECONDARY = 4
} TrackType;

// Desktop Utility::VSDReader::handleTrack (libUtility.dylib):
//   ClearPrimary(T); MarkPrimary(T) iff Abs(fDcaXY) < 0.5 && Abs(fDcaZ) < 1.0
// "Show primary tracks only" then hides tracks without bit (1<<14).
const Double_t kPrimaryDcaXyCut = 0.5; // cm
const Double_t kPrimaryDcaZCut  = 1.0; // cm

json track_to_json(TEveTrack *track, Int_t sign = 0, Int_t decayId = -1, TrackType type = STANDARD,
                   Bool_t isPrimary = kTRUE) {
    json j_track = json::object();

    Float_t x,y,z;

    j_track["trajectory"] = json::array();

    auto px = track->GetMomentum().fX;
    auto py = track->GetMomentum().fY;
    auto pz = track->GetMomentum().fZ;
    j_track["px"] = px;
    j_track["py"] = py;
    j_track["pz"] = pz;
    j_track["particleId"] = int(track->GetPdg());
    j_track["sign"] = sign;
    j_track["decayId"] = decayId;
    j_track["type"] = type;
    // Explicit flag mirroring desktop HelperPrimaryTracks::IsPrimary (bit 1<<14).
    j_track["isPrimary"] = isPrimary ? true : false;

    Double_t m = 0.0;

    if (track->GetPdg() != 0) {
        // Raa reconstructed tracks don't always carry a PDG code known to
        // TDatabasePDG (unlike the curated Strangeness V0/cascade legs), so
        // guard against a null lookup instead of segfaulting.
        auto* particle = database->GetParticle(track->GetPdg());
        if (particle != nullptr) {
            m = particle->Mass();
        }
    }

    j_track["mass"] = m;

    j_track["E"] = TMath::Sqrt(m * m + px * px + py * py + pz * pz);

    std::array<Float_t, 3> point;

    for(Int_t pointI = 0; pointI < track->Size(); pointI++) {
        track->GetPoint(pointI,point[0],point[1],point[2]);

        j_track["trajectory"].push_back(point);
    }
    return j_track;
}

void load_tracks(TEveVSD *fVSD, json &j) {
    Int_t nTracks = fVSD->fTreeR->GetEntries();
    std::cerr << "nTracks = " << nTracks << "\n";

    auto tracks = &j["tracks"];
    Int_t nPrimary = 0;
    Int_t nSecondary = 0;
    for (Int_t n = 0; n < nTracks; ++n)
    {
        fVSD->fTreeR->GetEntry(n);
        auto track = new TEveTrack(&fVSD->fR, trkProp);
        track->MakeTrack();

        // Same criterion as desktop Utility::VSDReader::handleTrack.
        const Bool_t isPrimary =
            TMath::Abs(fVSD->fR.fDcaXY) < kPrimaryDcaXyCut &&
            TMath::Abs(fVSD->fR.fDcaZ) < kPrimaryDcaZCut;
        const TrackType type = isPrimary ? STANDARD : SECONDARY;
        if (isPrimary) {
            ++nPrimary;
        } else {
            ++nSecondary;
        }

        auto j_track = track_to_json(track, fVSD->fR.fSign, -1, type, isPrimary);
        // NOTE: many RAA VSD RecTracks export fSign == 0. The web app fills
        // missing ±1 via helix inference in shared/utils/track-charge.ts on load.

        if (j_track["trajectory"].size() > 0) {
            tracks->push_back(j_track);
        }
        delete track;
    }
    std::cerr << "    primaries=" << nPrimary << " secondaries=" << nSecondary << "\n";
}

void load_v0s(TEveVSD *fVSD, json &j) {
    // Raa event directories only ship "RecTracks" + "Clusters" (no
    // "RecV0s"/"Hits"), unlike Strangeness. Nothing to do here for them.
    if (!fVSD->fTreeV0) {
        return;
    }

    Int_t nV0s = fVSD->fTreeV0->GetEntries();
    fVSD->fTreeR->GetEntry(0);

    Int_t nTracks = fVSD->fR.fIndex;

    auto decays = &j["decays"];

    std::cerr << "V0s: " << nV0s << std::endl;

    for (Int_t n = nTracks; n < nV0s; n++) {
        fVSD->fTreeV0->GetEntry(n);

        Int_t pdg = fVSD->fV0.fPdg;
        Int_t pdgN = 0;
        Int_t pdgP = 0;
        Double_t momentum = 0;
        Double_t mass = 0;

        switch (pdg) {
            case 310:
                pdgN = -211;
                pdgP = +211;
                break;
            case 3122:
                pdgN = -211;
                pdgP = +2212;
                break;
            case -3122:
                pdgN = -2212;
                pdgP = +211;
                break;
            default:
                continue;
        }

        TEveRecTrack rcNeg;
        rcNeg.fP.Set(fVSD->fV0.fPNeg);
        rcNeg.fV.Set(fVSD->fV0.fVNeg);
        rcNeg.fStatus = fVSD->fV0.fStatus;
        rcNeg.fLabel = fVSD->fV0.fDLabel[0];
        rcNeg.fSign = -1;
        rcNeg.fIndex = 0;
        mass = database->GetParticle(pdgN)->Mass();
        momentum = fVSD->fV0.fPNeg.Mag();
        rcNeg.fBeta = momentum / TMath::Sqrt(momentum * momentum + TMath::C() * TMath::C() * mass * mass);

        auto trackN = new TEveTrack(&rcNeg, trkProp);
        trackN->SetPdg(pdgN);
        trackN->SetUniqueID(n);
        trackN->MakeTrack();

        auto j_track_n = track_to_json(trackN, rcNeg.fSign, n, V0);

        TEveRecTrack rcPos;
        rcPos.fP.Set(fVSD->fV0.fPPos);
        rcPos.fV.Set(fVSD->fV0.fVPos);
        rcPos.fStatus = fVSD->fV0.fStatus;
        rcPos.fLabel = fVSD->fV0.fDLabel[1];
        rcPos.fSign = 1;
        mass = database->GetParticle(pdgP)->Mass();
        momentum = fVSD->fV0.fPPos.Mag();
        rcPos.fBeta = momentum / TMath::Sqrt(momentum * momentum + TMath::C() * TMath::C() * mass * mass);

        auto trackP = new TEveTrack(&rcPos, trkProp);
        trackP->SetPdg(pdgP);
        trackP->SetUniqueID(n);
        trackP->MakeTrack();

        auto j_track_p = track_to_json(trackP, rcPos.fSign, n, V0);

        auto v0 = json::array();
        v0.push_back(j_track_n);
        v0.push_back(j_track_p);

        decays->push_back(v0);
    }
}

void load_cascades(TEveVSD *fVSD, json &j) {
    if (!fVSD->fTreeR || !fVSD->fTreeV0) {
        return;
    }

    fVSD->fTreeR->GetEntry(0);
    Int_t nTracks = fVSD->fR.fIndex;

    auto decays = &j["decays"];

    std::cerr << "Cascades: " << nTracks << std::endl;

    for (Int_t n = 0; n < nTracks; ++n) {
        fVSD->fTreeV0->GetEntry(n);
        fVSD->fTreeR->GetEntry(n);

        Int_t pdgN = -211;
        Int_t pdgP = 2212;
        Int_t pdg = fVSD->fV0.fPdg;
        Double_t momentum = 0;
        Double_t mass = 0;

        switch (pdg) {
            case 3312:
                pdgN = -211;
                pdgP = +2212;
                break;
            case -3312:
                pdgN = +211;
                pdgP = -2212;
                break;
            default:
                break;
        }

        TEveRecTrack rcNeg;
        rcNeg.fP.Set(fVSD->fV0.fPNeg);
        rcNeg.fV.Set(fVSD->fV0.fVNeg);
        rcNeg.fStatus = fVSD->fV0.fStatus;
        rcNeg.fLabel = fVSD->fV0.fDLabel[0];
        rcNeg.fSign = -1;
        momentum = fVSD->fV0.fPNeg.Mag();
        mass = database->GetParticle(pdgN)->Mass();
        rcNeg.fBeta = momentum / TMath::Sqrt(momentum * momentum + TMath::C() * TMath::C() * mass * mass);

        auto* trackN = new TEveTrack(&rcNeg, trkProp);
        trackN->SetPdg(pdgN);
        trackN->SetUniqueID(n);
        trackN->MakeTrack();

        auto j_track_n = track_to_json(trackN, rcNeg.fSign, n, CASCADE);

        TEveRecTrack rcPos;
        rcPos.fP.Set(fVSD->fV0.fPPos);
        rcPos.fV.Set(fVSD->fV0.fVPos);
        rcPos.fStatus = fVSD->fV0.fStatus;
        rcPos.fLabel = fVSD->fV0.fDLabel[1];
        rcPos.fSign = 1;
        momentum = fVSD->fV0.fPPos.Mag();
        mass = database->GetParticle(pdgP)->Mass();
        rcPos.fBeta = momentum / TMath::Sqrt(momentum * momentum + TMath::C() * TMath::C() * mass * mass);

        auto* trackP = new TEveTrack(&rcPos, trkProp);
        trackP->SetPdg(pdgP);
        trackP->SetUniqueID(n);
        trackP->MakeTrack();

        auto j_track_p = track_to_json(trackP, rcPos.fSign, n, CASCADE);

        auto* trackB = new TEveTrack(&fVSD->fR, trkProp);
        trackB->SetPdg(fVSD->fR.fSign * 211);
        trackB->SetUniqueID(n);
        trackB->MakeTrack();

        auto j_track_b = track_to_json(trackB, fVSD->fR.fSign, n, CASCADE_BACHELOR);

        auto cascade = json::array();
        cascade.push_back(j_track_n);
        cascade.push_back(j_track_p);
        cascade.push_back(j_track_b);

        decays->push_back(cascade);
    }
}

void load_clusters(TEveVSD *fVSD, json &j) {
    auto clusters = &j["clusters"];

    if (!fVSD->fTreeC) {
        return;
    }

    std::vector<std::array<Float_t, 3>> allPoints;

    // ITS = 0, TPC = 1, TRD = 2, TOF = 3
    for (Int_t det_id = 0; det_id < 4; ++det_id) {
        auto ps = TEvePointSet("");
        TEvePointSelector ss(fVSD->fTreeC, &ps, "fV.fX:fV.fY:fV.fZ", TString::Format("fDetId==%d", det_id));
        ss.Select();

        for (Int_t i = 0; i < ps.Size(); ++i) {
            std::array<Float_t, 3> point{};
            ps.GetPoint(i, point[0], point[1], point[2]);
            allPoints.push_back(point);
        }
    }

    Int_t total = static_cast<Int_t>(allPoints.size());
    Int_t stride = 1;
    if (gMaxClusters > 0 && total > gMaxClusters) {
        stride = (total + gMaxClusters - 1) / gMaxClusters; // ceil(total / gMaxClusters)
    }

    for (Int_t i = 0; i < total; i += stride) {
        clusters->push_back(allPoints[i]);
    }

    std::cerr << "    clusters: " << total << " raw -> " << clusters->size()
               << " kept (stride " << stride << ")\n";
}

// Extract the numeric suffix from a directory name like "Event0159" -> 159.
Int_t event_number_from_name(const char *name) {
    TString s(name);
    TPMERegexp digits_re("(\\d+)");
    if (digits_re.Match(s) < 2) {
        return -1;
    }
    return digits_re[1].Atoi();
}

void process_file(TString inputFile, TString outputDir, TString datasetId) {
    std::cerr << "=== Processing " << inputFile << " ===\n";

    auto fDataFile = new TFile(inputFile);
    if (fDataFile->IsZombie()) {
        std::cerr << "Could not open " << inputFile << ", skipping\n";
        return;
    }

    auto fEvDirKeys = new TObjArray();
    TPMERegexp name_re("Event\\d+");
    TObjLink* lnk = fDataFile->GetListOfKeys()->FirstLink();
    while (lnk != nullptr) {
        if (name_re.Match(lnk->GetObject()->GetName()) != 0) {
            fEvDirKeys->Add(lnk->GetObject());
        }
        lnk = lnk->Next();
    }

    std::cerr << "Found " << fEvDirKeys->GetEntries() << " event directories\n";

    auto fVSD = new TEveVSD();

    std::string path = outputDir.Data();
    std::string cmd = "mkdir -p " + path;
    gSystem->Exec(cmd.c_str());

    for (Int_t EventIdx = 0; EventIdx < fEvDirKeys->GetEntries(); EventIdx++) {
        auto* KeyObj = fEvDirKeys->At(EventIdx);
        auto* KeyCast = dynamic_cast<TKey*>(KeyObj);
        auto* DirObj = KeyCast->ReadObj();
        auto* Directory = dynamic_cast<TDirectory*>(DirObj);

        Int_t realEventNumber = event_number_from_name(Directory->GetName());

        // Desktop Raa::EventDisplay::GetMagneticField / NewEvent(evNo):
        //   idx 0  → pp @ 7 TeV, B = 0 T (straight tracks)
        //   else   → B = 0.5 T
        // Must match the field used when clusters were produced, otherwise
        // helices diverge from the cluster cloud.
        const Double_t bField = (EventIdx == 0) ? 0.0 : 0.5;
        trkProp->SetMagField(bField);

        fVSD->SetDirectory(Directory);
        fVSD->LoadTrees();
        fVSD->SetBranchAddresses();

        json j = json::object();
        j["tracks"] = json::array();
        j["decays"] = json::array();
        j["clusters"] = json::array();

        load_tracks(fVSD, j);
        load_v0s(fVSD, j);
        load_cascades(fVSD, j);
        load_clusters(fVSD, j);

        std::string data_out = path + "/event_";

        std::ofstream o(data_out + datasetId.Data() + "_" + std::to_string(realEventNumber) + ".json");
        o << j << std::endl;

        std::cerr << "  event " << Directory->GetName() << " (idx " << EventIdx
                   << ", B=" << bField << " T) -> "
                   << j["tracks"].size() << " tracks, "
                   << j["clusters"].size() << " clusters, "
                   << j["decays"].size() << " decays\n";
    }

    fDataFile->Close();
}

void convert_events(TString inputDir, TString outputDir, Int_t firstDataset = 1, Int_t lastDataset = 10,
                     Int_t maxClusters = 25000) {
    trkProp = new TEveTrackPropagator();
    trkProp->SetMaxR(600); // R[cm]
    // Keep the shared propagator alive across TEveTrack deletes. With B=0,
    // TEveTrack::~TEveTrack otherwise drives OnZeroRefCount and segfaults.
    trkProp->IncRefCount();
    // Mag field is set per-event in process_file (0 T for idx 0, 0.5 T otherwise).
    database = TDatabasePDG::Instance();
    gMaxClusters = maxClusters;

    for (Int_t i = firstDataset; i <= lastDataset; i++) {
        TString file = inputDir + "/AliVSD_MasterClass_";
        file += i;
        file += ".root";
        process_file(file, outputDir, TString::Format("%d", i));
    }
}
