import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import AuthGate from "./auth/AuthGate";
import "./index.css";

ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement
).render(
    <React.StrictMode>
        <AuthProvider>
            <AuthGate>
                <App />
            </AuthGate>
        </AuthProvider>
    </React.StrictMode>
);
