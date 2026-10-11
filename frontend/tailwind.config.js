/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{ts,tsx}"
    ],
    theme: {
        extend: {
            colors: {
                base: "#0b1220",
                panel: "#121a2b",
                panelAlt: "#0f1626",
                edge: "#1e293b",
                accent: "#22d3ee"
            },
            borderRadius: {
                card: "6px"
            }
        }
    },
    plugins: []
};
