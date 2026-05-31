import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  getFirestore,
  collection,
  query,
  limit,
  getDocs,
} from "firebase/firestore";
import app from "./lib/firebase/config";
import App from "./App.tsx";
import "./index.css";

// Fires once at app boot, result discarded, errors silenced.
getDocs(query(collection(getFirestore(app), "_warmup"), limit(1))).catch(
  () => {}
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
