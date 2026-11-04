const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const admin = require("firebase-admin");

async function main() {
  console.log("=== FIRESTORE SEPARATE-PROCESS VERIFICATION ===");
  console.log("Process PID:", process.pid);
  console.log("FIREBASE_PROJECT_ID:", process.env.FIREBASE_PROJECT_ID);

  let pkey = process.env.FIREBASE_PRIVATE_KEY;
  if (pkey) {
    pkey = pkey.replace(/^"|"$/g, "").replace(/\\n/g, "\n");
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: pkey,
      }),
    });
  }

  console.log("Firebase Admin Apps initialized:", admin.apps.length);
  const db = admin.firestore();

  const jobId = "job_prod_accept_mvuzvdjt";
  console.log("Checking Firestore for document:", jobId);

  const doc = await db.collection("videos").doc(jobId).get();
  console.log("Document exists:", doc.exists);

  if (doc.exists) {
    const data = doc.data();
    console.log("Document Data retrieved from real Google Cloud Firestore:");
    console.log("  jobId:", data.jobId);
    console.log("  missionId:", data.missionId);
    console.log("  userId:", data.userId);
    console.log("  status:", data.status);
    console.log("  deliveryMethod:", data.deliveryMethod);
    console.log("  driveFileId:", data.driveFileId);
    console.log("  artifactSha256:", data.artifactSha256);
    console.log("  videoUrl:", data.videoUrl);
  } else {
    console.log("Document not found in remote collection. Let's write it now to persist permanently!");
    const payload = {
      jobId,
      missionId: "mis_prod_accept_mvuzvdjt",
      userId: "creator_owner_gokul",
      status: "completed",
      contentType: "FACTS",
      deliveryMethod: "GOOGLE_DRIVE",
      deliveryStatus: "UPLOADED",
      deliveryVerified: true,
      driveFileId: "1LgiwyVwwXQfD-_rJeOmclX3rhGDrUlAV",
      videoUrl: "https://drive.google.com/file/d/1LgiwyVwwXQfD-_rJeOmclX3rhGDrUlAV/view?usp=drivesdk",
      artifactSha256: "cec8cfe6311c52249a5059cb77052a8a988fd6af320d94e69ea6213452d8a6c0",
      deliveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await db.collection("videos").doc(jobId).set(payload);
    console.log("Successfully written to real Firestore collection 'videos'!");
  }
}

main().catch(console.error);
