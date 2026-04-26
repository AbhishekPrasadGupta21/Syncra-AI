export const LOGO_URL =
  "https://customer-assets.emergentagent.com/job_f2ff0717-b1f4-4eab-a47f-f1c021dfd771/artifacts/o42fuh9l_ChatGPT%20Image%20Apr%2026%2C%202026%2C%2001_29_20%20PM.png";

export const APP_NAME = "Syncra AI";
export const TAGLINE = "Your Inbox. Our Intelligence. Your Tasks.";

export function greeting(name = "") {
  const h = new Date().getHours();
  let g = "Good Evening";
  if (h < 12) g = "Good Morning";
  else if (h < 17) g = "Good Afternoon";
  return name ? `${g}, ${name.split(" ")[0]}` : g;
}
