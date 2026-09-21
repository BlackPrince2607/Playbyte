export type FlagItem = { flag: string; name: string; options: string[] };

const RAW: { flag: string; name: string }[] = [
  { flag: "🇮🇳", name: "India" },
  { flag: "🇺🇸", name: "United States" },
  { flag: "🇬🇧", name: "United Kingdom" },
  { flag: "🇯🇵", name: "Japan" },
  { flag: "🇧🇷", name: "Brazil" },
  { flag: "🇫🇷", name: "France" },
  { flag: "🇩🇪", name: "Germany" },
  { flag: "🇨🇦", name: "Canada" },
  { flag: "🇦🇺", name: "Australia" },
  { flag: "🇮🇹", name: "Italy" },
  { flag: "🇪🇸", name: "Spain" },
  { flag: "🇲🇽", name: "Mexico" },
  { flag: "🇰🇷", name: "South Korea" },
  { flag: "🇨🇳", name: "China" },
  { flag: "🇷🇺", name: "Russia" },
  { flag: "🇿🇦", name: "South Africa" },
  { flag: "🇪🇬", name: "Egypt" },
  { flag: "🇦🇷", name: "Argentina" },
  { flag: "🇳🇱", name: "Netherlands" },
  { flag: "🇸🇪", name: "Sweden" },
  { flag: "🇳🇴", name: "Norway" },
  { flag: "🇳🇿", name: "New Zealand" },
  { flag: "🇹🇷", name: "Turkey" },
  { flag: "🇸🇦", name: "Saudi Arabia" },
  { flag: "🇹🇭", name: "Thailand" },
  { flag: "🇻🇳", name: "Vietnam" },
  { flag: "🇮🇩", name: "Indonesia" },
  { flag: "🇵🇭", name: "Philippines" },
  { flag: "🇵🇱", name: "Poland" },
  { flag: "🇵🇹", name: "Portugal" },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickFlagQuestions(n: number): FlagItem[] {
  const picked = shuffle(RAW).slice(0, Math.min(n, RAW.length));
  return picked.map((item) => {
    const wrong = shuffle(RAW.filter((r) => r.name !== item.name))
      .slice(0, 3)
      .map((r) => r.name);
    return {
      flag: item.flag,
      name: item.name,
      options: shuffle([item.name, ...wrong]),
    };
  });
}
