import React, { useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { type } from "../theme/typography";
import { api } from "../api";

type Props = {
  gameKey: string;
  title: string;
  blurb: string;
  onDone: (score: number, durationMs: number) => void;
};

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, padding: 24 }}>
      <Text style={{ color: colors.lilac, letterSpacing: 2 }}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

export function HigherOrLower({ onDone }: Props) {
  const [n, setN] = useState(() => 1 + Math.floor(Math.random() * 50));
  const [score, setScore] = useState(0);
  const [started] = useState(Date.now());
  function guess(higher: boolean) {
    const next = 1 + Math.floor(Math.random() * 50);
    const ok = higher ? next >= n : next <= n;
    if (!ok) return onDone(score, Date.now() - started);
    setScore((s) => s + 1);
    setN(next);
  }
  return (
    <Shell title="Higher or Lower">
      <Text style={{ color: colors.paper, fontSize: 72, fontWeight: "700", marginVertical: 24 }}>{n}</Text>
      <Text style={{ color: colors.lilac }}>Streak {score}</Text>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
        <Btn label="Lower" onPress={() => guess(false)} />
        <Btn label="Higher" onPress={() => guess(true)} />
      </View>
    </Shell>
  );
}

export function MemorySequence({ onDone }: Props) {
  const seq = useMemo(() => [0, 1, 2, 3].map(() => Math.floor(Math.random() * 4)), []);
  const [step, setStep] = useState(0);
  const [started] = useState(Date.now());
  return (
    <Shell title="Memory Sequence">
      <Text style={{ color: colors.paper, fontSize: 22, marginVertical: 16 }}>Repeat: {seq.join(" · ")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <Btn
            key={i}
            label={String(i)}
            onPress={() => {
              if (seq[step] !== i) return onDone(step, Date.now() - started);
              if (step + 1 >= seq.length) return onDone(seq.length * 10, Date.now() - started);
              setStep(step + 1);
            }}
          />
        ))}
      </View>
    </Shell>
  );
}

export function TrafficLight({ onDone }: Props) {
  const [phase, setPhase] = useState<"red" | "green">("red");
  const [at, setAt] = useState(0);
  const [started] = useState(Date.now());
  React.useEffect(() => {
    const t = setTimeout(() => {
      setPhase("green");
      setAt(Date.now());
    }, 800 + Math.random() * 1800);
    return () => clearTimeout(t);
  }, []);
  return (
    <Shell title="Traffic Light">
      <View
        style={{
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: phase === "green" ? colors.lime : "#93000a",
          marginVertical: 32,
        }}
      />
      <Btn
        label="Tap"
        onPress={() => {
          if (phase !== "green") return onDone(0, Date.now() - started);
          const ms = Date.now() - at;
          onDone(Math.max(0, 1000 - ms), Date.now() - started);
        }}
      />
    </Shell>
  );
}

export function TimerStop({ onDone }: Props) {
  const [running, setRunning] = useState(true);
  const [ms, setMs] = useState(0);
  const [started] = useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setMs(Date.now() - started), 16);
    return () => clearInterval(id);
  }, [started]);
  return (
    <Shell title="Timer Stop">
      <Text style={{ color: colors.lime, fontSize: 48, marginVertical: 24 }}>{(ms / 1000).toFixed(3)}</Text>
      <Text style={{ color: colors.lilac }}>Stop at 9.999s</Text>
      <Btn
        label="Stop"
        onPress={() => {
          setRunning(false);
          const err = Math.abs(ms - 9999);
          onDone(Math.max(0, 1000 - err), Date.now() - started);
        }}
      />
    </Shell>
  );
}

export function ColorMatch({ onDone }: Props) {
  const words = ["PINK", "LIME", "LILAC"];
  const cols = [colors.pink, colors.lime, colors.lilac];
  const word = words[Math.floor(Math.random() * 3)];
  const colI = Math.floor(Math.random() * 3);
  const [started] = useState(Date.now());
  const match = words[colI] === word;
  return (
    <Shell title="Color Match">
      <Text style={{ color: cols[colI], fontSize: 40, fontWeight: "700", marginVertical: 24 }}>{word}</Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Btn label="Match" onPress={() => onDone(match ? 10 : 0, Date.now() - started)} />
        <Btn label="No" onPress={() => onDone(match ? 0 : 10, Date.now() - started)} />
      </View>
    </Shell>
  );
}

export function FrenzyTap({ onDone }: Props) {
  const [count, setCount] = useState(0);
  const [left, setLeft] = useState(8);
  const [started] = useState(Date.now());
  const finished = useRef(false);
  React.useEffect(() => {
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, []);
  React.useEffect(() => {
    if (left > 0 || finished.current) return;
    finished.current = true;
    onDone(count, Date.now() - started);
  }, [left, count, onDone, started]);
  return (
    <Shell title="Frenzy Tap">
      <Text style={{ color: colors.paper, fontSize: 64 }}>{count}</Text>
      <Text style={{ color: colors.lilac }}>{left}s</Text>
      <Btn label="TAP" onPress={() => setCount((c) => c + 1)} />
    </Shell>
  );
}

export function OddOneOut({ onDone }: Props) {
  const [started] = useState(Date.now());
  return (
    <Shell title="Odd One Out">
      <Text style={{ color: colors.paper, fontSize: 28, marginVertical: 16 }}>Which is different?</Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Btn label="●" onPress={() => onDone(0, Date.now() - started)} />
        <Btn label="●" onPress={() => onDone(0, Date.now() - started)} />
        <Btn label="▲" onPress={() => onDone(15, Date.now() - started)} />
        <Btn label="●" onPress={() => onDone(0, Date.now() - started)} />
      </View>
    </Shell>
  );
}

export function PerfectCircle({ onDone }: Props) {
  const [started] = useState(Date.now());
  return (
    <Shell title="Perfect Circle">
      <Text style={{ color: colors.paper, marginVertical: 16 }}>Hold and release when it feels round.</Text>
      <Btn label="I drew it" onPress={() => onDone(70 + Math.floor(Math.random() * 30), Date.now() - started)} />
    </Shell>
  );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ backgroundColor: colors.cardAlt, padding: 16, borderRadius: 14, minWidth: 100, alignItems: "center" }}
    >
      <Text style={{ color: colors.paper, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

const registry: Record<string, React.ComponentType<Props>> = {
  higher_or_lower: HigherOrLower,
  memory_sequence: MemorySequence,
  traffic_light: TrafficLight,
  timer_stop: TimerStop,
  color_match: ColorMatch,
  frenzy_tap: FrenzyTap,
  odd_one_out: OddOneOut,
  perfect_circle: PerfectCircle,
};

export function GameEngine(props: Props) {
  const Cmp = registry[props.gameKey] ?? HigherOrLower;
  return <Cmp {...props} />;
}

export async function submitPlay(
  gameKey: string,
  score: number,
  durationMs: number,
  idempotencyKey: string,
) {
  return api<{ score: number; percentile: number; playsToday: number; promptAccountCreation: boolean }>(
    `/v1/games/${gameKey}/plays`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ score, durationMs }),
    },
  );
}
