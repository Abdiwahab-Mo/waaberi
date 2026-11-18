import icon from "./assets/logo-icon.png";

export default function Logo({ className = "", withText = true }) {
  return (
    <span className={`logo-mark ${className}`}>
      <img className="logo-icon" src={icon} alt={withText ? "" : "Waaberi"} />
      {withText && <span className="logo-word">WAABERI<small>Party</small></span>}
    </span>
  );
}
