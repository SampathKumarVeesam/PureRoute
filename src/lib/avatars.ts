import type { GenderOption } from '../types/domain';

export interface PresetAvatar {
  id: string;
  label: string;
  gender: GenderOption;
  dataUri: string;
}

function makeAvatarSvg(opts: {
  bg1: string;
  bg2: string;
  skin: string;
  hair: string;
  shirt: string;
  hairStyle: 'short' | 'long' | 'bob' | 'wavy' | 'turban' | 'bun' | 'abstract';
  accent: string;
}): string {
  let hairMarkup = '';
  if (opts.hairStyle === 'short') {
    hairMarkup = `<path d="M29 44 C29 24, 71 24, 71 44 C66 34, 34 34, 29 44 Z" fill="${opts.hair}"/>`;
  } else if (opts.hairStyle === 'long') {
    hairMarkup = `<path d="M24 72 L24 44 C24 20, 76 20, 76 44 L76 72 C70 68, 66 56, 66 44 C59 35, 41 35, 34 44 C34 56, 30 68, 24 72 Z" fill="${opts.hair}"/>`;
  } else if (opts.hairStyle === 'bob') {
    hairMarkup = `<path d="M26 58 C24 24, 76 24, 74 58 C68 54, 67 45, 65 40 C58 34, 42 34, 35 40 C33 45, 32 54, 26 58 Z" fill="${opts.hair}"/>`;
  } else if (opts.hairStyle === 'wavy') {
    hairMarkup = `<path d="M26 48 C24 22, 76 22, 74 48 C70 40, 62 36, 50 38 C38 36, 30 40, 26 48 Z" fill="${opts.hair}"/>`;
  } else if (opts.hairStyle === 'bun') {
    hairMarkup = `<circle cx="50" cy="21" r="9" fill="${opts.hair}"/><path d="M28 46 C28 24, 72 24, 72 46 C64 36, 36 36, 28 46 Z" fill="${opts.hair}"/>`;
  } else if (opts.hairStyle === 'turban') {
    hairMarkup = `<path d="M27 42 C27 19, 73 19, 73 42 C62 36, 38 36, 27 42 Z" fill="${opts.accent}"/><path d="M32 34 Q50 26 68 34" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2" fill="none"/>`;
  } else {
    hairMarkup = `<circle cx="50" cy="48" r="22" fill="${opts.accent}" fill-opacity="0.22"/><path d="M36 52 Q50 32 64 52" stroke="${opts.accent}" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="50" cy="42" r="5" fill="${opts.accent}"/>`;
  }

  const faceAndBody =
    opts.hairStyle === 'abstract'
      ? hairMarkup
      : `
        <path d="M22 96 C24 74, 36 68, 50 68 C64 68, 76 74, 78 96 Z" fill="${opts.shirt}"/>
        <rect x="44" y="58" width="12" height="14" rx="5" fill="${opts.skin}"/>
        <circle cx="50" cy="45" r="18" fill="${opts.skin}"/>
        ${hairMarkup}
        <circle cx="43.5" cy="46" r="1.9" fill="#0f172a"/>
        <circle cx="56.5" cy="46" r="1.9" fill="#0f172a"/>
        <path d="M45 53 Q50 57 55 53" stroke="#0f172a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      `;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="120" height="120">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${opts.bg1}"/>
        <stop offset="100%" stop-color="${opts.bg2}"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="50" fill="url(#g)"/>
    ${faceAndBody}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const PRESET_AVATARS: PresetAvatar[] = [
  // Male
  {
    id: 'preset:male-1',
    label: 'Aarav',
    gender: 'Male',
    dataUri: makeAvatarSvg({
      bg1: '#0f293a',
      bg2: '#1b4965',
      skin: '#d9a17c',
      hair: '#1e1b18',
      shirt: '#38bdf8',
      hairStyle: 'short',
      accent: '#38bdf8',
    }),
  },
  {
    id: 'preset:male-2',
    label: 'Srinivas',
    gender: 'Male',
    dataUri: makeAvatarSvg({
      bg1: '#1a2e25',
      bg2: '#2d5a47',
      skin: '#c68b63',
      hair: '#1f2937',
      shirt: '#d97706',
      hairStyle: 'turban',
      accent: '#f59e0b',
    }),
  },
  {
    id: 'preset:male-3',
    label: 'Vikram',
    gender: 'Male',
    dataUri: makeAvatarSvg({
      bg1: '#17253a',
      bg2: '#283d5e',
      skin: '#e0ac89',
      hair: '#111827',
      shirt: '#e2e8f0',
      hairStyle: 'wavy',
      accent: '#94a3b8',
    }),
  },
  // Female
  {
    id: 'preset:female-1',
    label: 'Ananya',
    gender: 'Female',
    dataUri: makeAvatarSvg({
      bg1: '#183242',
      bg2: '#2c5364',
      skin: '#dba582',
      hair: '#181412',
      shirt: '#f59e0b',
      hairStyle: 'long',
      accent: '#fbbf24',
    }),
  },
  {
    id: 'preset:female-2',
    label: 'Priya',
    gender: 'Female',
    dataUri: makeAvatarSvg({
      bg1: '#1b3136',
      bg2: '#2b585f',
      skin: '#c98e68',
      hair: '#1c1917',
      shirt: '#34d399',
      hairStyle: 'bun',
      accent: '#34d399',
    }),
  },
  {
    id: 'preset:female-3',
    label: 'Kavya',
    gender: 'Female',
    dataUri: makeAvatarSvg({
      bg1: '#23283d',
      bg2: '#394366',
      skin: '#e4b392',
      hair: '#292524',
      shirt: '#fb7185',
      hairStyle: 'bob',
      accent: '#fb7185',
    }),
  },
  // Non-Binary
  {
    id: 'preset:nb-1',
    label: 'Alex',
    gender: 'Non-Binary',
    dataUri: makeAvatarSvg({
      bg1: '#112a36',
      bg2: '#1f4e5f',
      skin: '#d59d78',
      hair: '#27272a',
      shirt: '#2dd4bf',
      hairStyle: 'wavy',
      accent: '#2dd4bf',
    }),
  },
  {
    id: 'preset:nb-2',
    label: 'Sam',
    gender: 'Non-Binary',
    dataUri: makeAvatarSvg({
      bg1: '#1f2937',
      bg2: '#374151',
      skin: '#e0b08d',
      hair: '#18181b',
      shirt: '#facc15',
      hairStyle: 'bob',
      accent: '#facc15',
    }),
  },
  {
    id: 'preset:nb-3',
    label: 'Rohan / Ray',
    gender: 'Non-Binary',
    dataUri: makeAvatarSvg({
      bg1: '#0f2433',
      bg2: '#1c445c',
      skin: '#c78c64',
      hair: '#171717',
      shirt: '#a78bfa',
      hairStyle: 'short',
      accent: '#a78bfa',
    }),
  },
  // Prefer not to say
  {
    id: 'preset:neutral-1',
    label: 'Dawn Ripple',
    gender: 'Prefer not to say',
    dataUri: makeAvatarSvg({
      bg1: '#0b1e2d',
      bg2: '#17435c',
      skin: '#e2e8f0',
      hair: '#111827',
      shirt: '#38bdf8',
      hairStyle: 'abstract',
      accent: '#7dd3fc',
    }),
  },
  {
    id: 'preset:neutral-2',
    label: 'Golden Meadow',
    gender: 'Prefer not to say',
    dataUri: makeAvatarSvg({
      bg1: '#1c261f',
      bg2: '#334d3c',
      skin: '#e2e8f0',
      hair: '#111827',
      shirt: '#fbbf24',
      hairStyle: 'abstract',
      accent: '#fbbf24',
    }),
  },
  {
    id: 'preset:neutral-3',
    label: 'Pure Vessel',
    gender: 'Prefer not to say',
    dataUri: makeAvatarSvg({
      bg1: '#192231',
      bg2: '#2d3b52',
      skin: '#e2e8f0',
      hair: '#111827',
      shirt: '#f8fafc',
      hairStyle: 'abstract',
      accent: '#f8fafc',
    }),
  },
];

export function getPresetsByGender(gender: GenderOption): PresetAvatar[] {
  return PRESET_AVATARS.filter((a) => a.gender === gender);
}

export function resolveAvatarSrc(avatarUrl?: string | null): string {
  if (!avatarUrl) return PRESET_AVATARS[9].dataUri;
  if (avatarUrl.startsWith('data:image/')) return avatarUrl;
  const preset = PRESET_AVATARS.find((p) => p.id === avatarUrl);
  return preset ? preset.dataUri : PRESET_AVATARS[9].dataUri;
}
