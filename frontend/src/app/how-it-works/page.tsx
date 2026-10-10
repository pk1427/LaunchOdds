import { GlassCard } from "@/components/ui";

export default function HowItWorksPage() {
  return <div className="mx-auto max-w-3xl"><h1 className="text-3xl font-black tracking-tight">How Storyscore works</h1><div className="mt-6 space-y-4">
    <GlassCard><h2 className="font-bold">The idea</h2><p className="mt-2 text-sm text-slate-300">Every market is a simple question: will this Hacker News story hit its goal before time runs out? Choose YES or NO and add MON to your side. When the result is known, winners can collect their share.</p></GlassCard>
    <GlassCard><h2 className="font-bold">What you could receive</h2><p className="mt-2 text-sm text-slate-300">Imagine YES has 0.2 MON and NO has 0.1 MON. Together, that is 0.3 MON. The winning side shares the other side’s money based on how much each person put in; the amount shown before the result is only an estimate.</p></GlassCard>
    <GlassCard><h2 className="font-bold">If something goes wrong</h2><p className="mt-2 text-sm text-slate-300">If nobody chose the winning side, everyone gets their original amount back. If a result is not submitted in time, anyone can start the refund process. The app only shows a claim button when the contract says money is available.</p></GlassCard>
    <GlassCard><h2 className="font-bold">A note on trust</h2><p className="mt-2 text-sm text-slate-300">This app uses Monad Testnet. A trusted service submits the final Hacker News score because the contract cannot read Hacker News by itself. It is a test app, so use testnet MON only.</p></GlassCard>
  </div></div>;
}
