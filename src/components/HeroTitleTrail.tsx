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
      <path d="M 150 57 C 195 58, 245.84 55.76, 265.5 42 C 275.5 35, 281.5 26, 281.5 17 C 281.5 8, 273.5 1, 266.5 5 C 262.5 7, 261.5 11, 261.5 13 C 261.5 11, 260.5 7, 256.5 5 C 249.5 1, 241.5 8, 241.5 17 C 241.5 28, 253.5 36, 261.5 40 C 265.91 42.21, 271.75 44, 276 43 C 280.25 42, 284.67 38, 287 34 C 289.33 30, 290.17 24, 290 19 C 289.83 14, 288.17 8.5, 286 4 C 283.83 -0.5, 280.83 -4.5, 277 -8 C 273.17 -11.5, 266.33 -13.67, 263 -17 C 259.67 -20.33, 257.5 -24.33, 257 -28 C 256.5 -31.67, 258.17 -36, 260 -39 C 261.83 -42, 265.33 -43.67, 268 -46" fill="none" stroke="url(#hero-trail-fade)" strokeOpacity="0.6" strokeWidth="1.3" strokeDasharray="3 4" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(268 -46) rotate(-41.19) scale(0.5)">
        <path d="M0 -12 L48 0 L17 4 Z" fill="#6A70A0" />
        <path d="M17 4 L48 0 L9 17 Z" fill="#1B1F3B" />
        <path d="M17 4 L23 9 L9 17 Z" fill="#0E1124" />
      </g>
    </svg>
  );
}
