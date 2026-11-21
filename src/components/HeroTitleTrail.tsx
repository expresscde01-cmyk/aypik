export function HeroTitleTrailDesktop() {
  return (
    <svg className="hero-title-trail hero-title-trail--desktop" xmlns="http://www.w3.org/2000/svg" viewBox="-50 -70 1100 230" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d="M -40 48 C -33 54, -20 75, 0 82 C 20 89, 50 92, 80 92 C 110 92, 143 87, 180 80 C 217 73, 270 62, 300 52 C 330 42, 342 30, 360 20 C 378 10, 403 2, 406 -6 C 409 -14, 386 -19, 380 -26 C 374 -33, 371 -44, 372 -50 C 373 -56, 382 -63, 388 -64 C 394 -65, 400 -56, 406 -56 C 412 -56, 418 -65, 424 -64 C 430 -63, 439 -56, 440 -50 C 441 -44, 438 -33, 432 -26 C 426 -19, 405 -12, 406 -6 C 407 -0, 421 12, 440 8 C 459 4, 483 -22, 520 -30 C 557 -38, 613 -40, 660 -40 C 707 -40, 763 -34, 800 -28 C 837 -22, 858 -12, 880 -4 C 902 4, 913 16, 930 22 C 947 28, 962 31, 980 30 C 998 29, 1027 17, 1036 14" fill="none" stroke="#1B1F3B" strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="5 6" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(1036 14) rotate(-15.9) scale(1.0)">
        <path d="M0 -12 L48 0 L17 4 Z" fill="#6A70A0" />
        <path d="M17 4 L48 0 L9 17 Z" fill="#1B1F3B" />
        <path d="M17 4 L23 9 L9 17 Z" fill="#0E1124" />
      </g>
    </svg>
  );
}

export function HeroTitleTrailMobile() {
  return (
    <svg className="hero-title-trail hero-title-trail--mobile" xmlns="http://www.w3.org/2000/svg" viewBox="-10 -40 330 110" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="hero-trail-fade" gradientUnits="userSpaceOnUse" x1="150" y1="57" x2="185" y2="57.6">
          <stop offset="0" stopColor="#1B1F3B" stopOpacity="0" />
          <stop offset="1" stopColor="#1B1F3B" stopOpacity="1" />
        </linearGradient>
      </defs>
      <g transform="translate(16 0)">
        <path d="M 150 57 C 190 58, 226 52, 246 38 C 256 31, 262 22, 262 13 C 262 4, 254 -3, 247 1 C 243 3, 242 7, 242 9 C 242 7, 241 3, 237 1 C 230 -3, 222 4, 222 13 C 222 24, 234 32, 242 36 C 252 41, 266 36, 270 24 C 274 12, 270 -6, 276 -18 C 279 -24, 283 -28, 288 -31" fill="none" stroke="url(#hero-trail-fade)" strokeOpacity="0.6" strokeWidth="1.3" strokeDasharray="3 4" strokeLinecap="round" strokeLinejoin="round" />
        <g transform="translate(288 -31) rotate(-30.96) scale(0.5)">
          <path d="M0 -12 L48 0 L17 4 Z" fill="#6A70A0" />
          <path d="M17 4 L48 0 L9 17 Z" fill="#1B1F3B" />
          <path d="M17 4 L23 9 L9 17 Z" fill="#0E1124" />
        </g>
      </g>
    </svg>
  );
}
