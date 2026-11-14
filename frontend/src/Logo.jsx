import raw from "./assets/logo.svg?raw";

// Logo is embedded in the JavaScript bundle, so it always shows with the current build
export default function Logo({ className = "" }) {
  return <span className={`logo-svg ${className}`} role="img" aria-label="Waaberi" dangerouslySetInnerHTML={{ __html: raw }} />;
}
