// Public config — no secrets here (Client IDs and web-app URLs are public).
// Data proxy (Pexels key lives in its Script Properties):
window.PIXELS_API_BASE =
  "https://script.google.com/macros/s/AKfycbwA78jdPLLFs1GfN3jcZV6al-NLuTCRucgAOt1LpWR_emqzY_M8nNco6dW702I1YNlL9A/exec";

// Central login service (auth-sankhacooray-com) — verifies Google sign-in,
// checks the allowlist, and returns an app token.
window.PIXELS_AUTH_URL =
  "https://script.google.com/macros/s/AKfycbycqFHitkAFCLYaXkHPsuZEVOukL2at0pieC8KQEg2xYifpasVlQBQN4IEeFXQQ_nIukg/exec";

// This app's id in the auth registry.
window.PIXELS_APP_ID = "pixels";

// "Sign in with Google" OAuth Client ID (created in bsc2fast's Google Cloud).
// Public value. Paste the Client ID here once you create it.
window.GOOGLE_CLIENT_ID = "PASTE_YOUR_OAUTH_CLIENT_ID_HERE.apps.googleusercontent.com";
