import React from 'react';

/**
 * 1. מצב תצוגה מורחב (Detailed Vertical):
 * ריבוע ומתחתיו ענף שמתפצל לשני ריבועים (ריבועים גדולים ככל שניתן להכניס).
 */
export const DetailedViewIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Top prominent square (large as possible) */}
    <rect x="7.75" y="1.5" width="8.5" height="8.5" rx="1.5" />
    {/* Branching stem connecting to two bottom squares */}
    <path d="M 12 10 v 2.25 M 6.25 14.25 v -2 h 11.5 v 2" />
    {/* Two large bottom squares */}
    <rect x="2" y="14" width="8.5" height="8.5" rx="1.5" />
    <rect x="13.5" y="14" width="8.5" height="8.5" rx="1.5" />
  </svg>
);

/**
 * 2. מקוצרת לאורך (Compact Vertical):
 * עיגול קטן ומתחתיו ענף שמתפצל לשני עיגולים (העיגולים קטנים מהריבועים של המצב המורחב, ומסמל תמציתיות).
 */
export const CompactVerticalIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Top small circle (small compared to squares to signify compactness) */}
    <circle cx="12" cy="4.5" r="2.75" />
    {/* Branching stem */}
    <path d="M 12 7.25 v 4.25 M 6.5 14.5 v -3 h 11 v 3" />
    {/* Two small bottom circles */}
    <circle cx="6.5" cy="17.25" r="2.75" />
    <circle cx="17.5" cy="17.25" r="2.75" />
  </svg>
);

/**
 * 3. מקוצרת לרוחב (Compact Horizontal):
 * מספר מלבנים דקים אחד מעל השני, באופן המסמל את השכבות בתצורה הרוחבית.
 */
export const CompactHorizontalIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Thin horizontal rectangles stacked vertically representing horizontal tiers/layers */}
    <rect x="2.5" y="3.5" width="19" height="3.2" rx="1" />
    <rect x="2.5" y="10.4" width="19" height="3.2" rx="1" />
    <rect x="2.5" y="17.3" width="19" height="3.2" rx="1" />
  </svg>
);
