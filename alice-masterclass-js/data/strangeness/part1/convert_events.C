#include "json.hpp"
#include <TEveVSD.h>
#include <TDatabasePDG.h>
#include <TEveTrack.h>
#include <TEveTrackPropagator.h>

using json = nlohmann::json;

TEveTrackPropagator* trkProp;
TDatabasePDG* database;

typedef enum TrackType {
  STANDARD = 0,
  V0 = 1,
  CASCADE = 2,
  CASCADE_BACHELOR = 3
} TrackType;

json track_to_json(TEveTrack *track, Int_t sign = 0, Int_t decayId = -1, TrackType type = STANDARD) {
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

    Double_t m = 0.0;

    if(track->GetPdg() != 0)
        m = database->GetParticle(track->GetPdg())->Mass();

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
    for (Int_t n = 0; n < nTracks; ++n)
    {
        fVSD->fTreeR->GetEntry(n);
        auto track = new TEveTrack(&fVSD->fR, trkProp);
        track->MakeTrack();

        auto j_track = track_to_json(track);

        if (j_track["trajectory"].size() > 0) {
            tracks->push_back(j_track);
        }      
    }
}

void load_v0s(TEveVSD *fVSD, json &j) {
    Int_t nV0s = fVSD->fTreeV0->GetEntries();
    fVSD->fTreeR->GetEntry(0);

    //TEvePointSelector ss(fVSD->fTreeV0, fV0s, "fVCa.fX:fVCa.fY:fVCa.fZ");
    //ss.Select();

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
                // FIXME What is this case? It can occur.
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

        // Some AliVSD demo events list the same V0 twice; skip exact kinematic dupes.
        bool duplicate = false;
        for (const auto &existing : *decays) {
            if (existing == v0) {
                duplicate = true;
                break;
            }
        }
        if (duplicate) {
            std::cerr << "Skipping duplicate V0 at tree index " << n << std::endl;
            continue;
        }

        std::cout << v0 << std::endl;

        decays->push_back(v0);
    }
}

void load_cascades(TEveVSD *fVSD, json &j) {
    if (!fVSD->fTreeR) {
        return;
    }

    fVSD->fTreeR->GetEntry(0);
    Int_t nTracks = fVSD->fR.fIndex;

    auto decays = &j["decays"];

    std::cerr << "Cascades: " << nTracks << std::endl;

    for (Int_t n = 0; n < nTracks; ++n) {
        fVSD->fTreeV0->GetEntry(n);
        fVSD->fTreeR->GetEntry(n);

        Int_t pdgN = -211; // pi-
        Int_t pdgP = 2212; // proton
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
                // FIXME What is this case? It can occur!
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

        std::cout << cascade << std::endl;

        decays->push_back(cascade);
    }
}

void load_clusters(TEveVSD *fVSD, json &j) {
    auto clusters = &j["clusters"];

    if (!fVSD->fTreeC) {
        return;
    }

    // ITS = 0, TPC = 1, TRD = 2, TOF = 3
    for (Int_t det_id = 0; det_id < 4; ++det_id) {
        auto ps = TEvePointSet("");
        TEvePointSelector ss(fVSD->fTreeC, &ps, "fV.fX:fV.fY:fV.fZ", TString::Format("fDetId==%d", det_id));
        ss.Select();

        for (Int_t i = 0; i < ps.Size(); ++i) {
            std::array<Float_t, 3> point{};
            ps.GetPoint(i, point[0], point[1], point[2]);
            clusters->push_back(point);
        }
    }
}

void process_file(TString inputDir, TString outputDir, Int_t fileID) {
    TString file = inputDir + "/AliVSD_MasterClass_";
    file += fileID;
    file += ".root";

    auto fDataFile = new TFile(file);
    auto fEvDirKeys = new TObjArray();
    TPMERegexp name_re("Event\\d+");
    TObjLink* lnk = fDataFile->GetListOfKeys()->FirstLink();
    while (lnk != nullptr) {
        std::cerr << "Got Events\n";
        if (name_re.Match(lnk->GetObject()->GetName()) != 0) {
            fEvDirKeys->Add(lnk->GetObject());
        }
        lnk = lnk->Next();
    }

    auto fVSD = new TEveVSD();

    for(Int_t EventIdx = 0; EventIdx < fEvDirKeys->GetEntries(); EventIdx++) {
        std::cerr << "Begin Directory tour\n";

        auto* KeyObj = fEvDirKeys->At(EventIdx);
        std::cerr << "New directory ptr " << KeyObj << std::endl;
        auto* KeyCast = dynamic_cast<TKey*>(KeyObj);
        std::cerr << "New directory ptr " << KeyCast << std::endl;
        auto* DirObj = KeyCast->ReadObj();
        std::cerr << "New directory obj ptr " << DirObj << std::endl;
        auto* Directory = dynamic_cast<TDirectory*>(DirObj);
        std::cerr << "New directory obj ptr " << Directory << std::endl;

        fVSD->SetDirectory(Directory);

        std::cerr << "Load Trees from" << Directory->GetPath() << std::endl;
        // Attach event data from current directory.
        fVSD->LoadTrees();
        std::cerr << "Set addresses\n";
        fVSD->SetBranchAddresses();

        json j = json::object();
        j["tracks"] = json::array();
        j["decays"] = json::array();
        j["clusters"] = json::array();

        load_tracks(fVSD, j);
        load_v0s(fVSD, j);
        load_cascades(fVSD, j);
        load_clusters(fVSD, j);

        std::string path = outputDir.Data();
        
        std::string cmd = "mkdir -p " + path;
        
        gSystem->Exec(cmd.c_str());

        std::string data_out = path + "/event_";

        std::ofstream o(data_out + fileID + "_" + EventIdx + ".json");
        o << j << std::endl;
    }
}

void convert_events(TString inputDir, TString outputDir) {
    trkProp = new TEveTrackPropagator();
    trkProp->SetMagField(0.5); //Tesla
    trkProp->SetMaxR(600); // R[cm]
    database = TDatabasePDG::Instance();
    
    for(Int_t i = 0; i <= 20; i++) {
        process_file(inputDir, outputDir, i);
    }
}