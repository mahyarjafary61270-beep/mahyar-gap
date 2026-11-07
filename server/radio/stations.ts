import type { RadioStation } from '../../shared/types.js';

/**
 * The four 24/7 internet radio stations streamed into LiveKit voice rooms
 * by the server-side publisher (never played per-browser).
 */
export const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'popular-fa',
    name: 'پرطرفدار فارسی',
    englishName: 'Popular FA',
    streamUrl: 'https://stream.radiox.pro/listen/popularfa/radio.mp3',
    gradient: 'from-violet-500 to-fuchsia-500',
    icon: 'flame',
  },
  {
    id: 'shooti',
    name: 'شوتی',
    englishName: 'Shooti',
    streamUrl: 'https://stream.radiox.pro/listen/shooti/radio.mp3',
    gradient: 'from-sky-500 to-cyan-400',
    icon: 'sparkles',
  },
  {
    id: 'popular',
    name: 'پرطرفدار جهانی',
    englishName: 'Popular',
    streamUrl: 'https://stream.radiox.pro/listen/popular/radio.mp3',
    gradient: 'from-emerald-500 to-teal-400',
    icon: 'globe',
  },
  {
    id: 'sad',
    name: 'غمگین',
    englishName: 'Sad',
    streamUrl: 'https://stream.radiox.pro/listen/sad/radio.mp3',
    gradient: 'from-indigo-500 to-blue-500',
    icon: 'cloud-rain',
  },
];

export function getStation(id: string): RadioStation | undefined {
  return RADIO_STATIONS.find((s) => s.id === id);
}
