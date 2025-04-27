import React, { useState } from "react";
import { Link } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import "./Header.css";
import logo from "../assets/logo.png";

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <header className="header">
      {/* Left Section: Logo */}
      <div className="logo-container">
  <Link to="/"> {/* Wrap the logo in a Link */}
    <img src={logo} alt="Logo" className="logo" />
  </Link>
</div>

      {/* Center Section: Navigation */}
      <nav className={`nav-menu ${menuOpen ? "open" : ""}`}>
        <ul>
          <li>
            <Link to="/" onClick={() => setMenuOpen(false)}>Home</Link>
          </li>
          <li>
            <Link to="/memes" onClick={() => setMenuOpen(false)}>Meme Generator</Link>
          </li>
          <li>
            <a
              href="https://genbetasol.com"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              GenBeta
            </a>
          </li>
        </ul>
      </nav>

      {/* Hamburger Icon for Mobile */}
      <div className="hamburger" onClick={toggleMenu}>
        <div className="bar"></div>
        <div className="bar"></div>
        <div className="bar"></div>
      </div>

      {/* Right Section: Wallet Button */}
      <div className="wallet-button">
        <WalletMultiButton />
      </div>
    </header>
  );
}

export default Header;
