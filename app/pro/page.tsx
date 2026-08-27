"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { BASELINE, analyze, buildDopingProfile, solveEquilibriumPotential, type Implant } from "./physics";

type Form = { energy: string; dose: string };

function parseDose(value: string) {
  const parsed = Number(value.trim().replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatDose(value: number) {
  return value.toExponential(1).replace("e+", "E").replace("e", "E");
}

const baselineDoping = buildDopingProfile(BASELINE);
const baselinePhi = solveEquilibriumPotential(baselineDoping.na, baselineDoping.dxCm);

function scoreTone(metric: "retention" | "leakage" | "gidl", value: number) {
  if (metric === "retention") return value >= 100 ? "good" : value >= 85 ? "caution" : "risk";
  return value <= 110 ? "good" : value <= 250 ? "caution" : "risk";
}

function DopingChart({ inputNa }: { inputNa: number[] }) {
  const width = 760, height = 300, left = 64, right = 22, top = 22, bottom = 40;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const depths = baselineDoping.depths;
  const x = (depthUm: number) => left + (depthUm / 0.58) * chartWidth;
  const y = (value: number) => top + (1 - (Math.log10(Math.max(value, 1e15)) - 15) / 5) * chartHeight;
  const path = (values: number[]) => depths.map((d, i) => `${i === 0 ? "M" : "L"}${x(d).toFixed(2)},${y(values[i]).toFixed(2)}`).join(" ");
  return (
    <div className="chart-shell">
      <div className="chart-heading"><div><span className="eyebrow">DOPING PROFILE</span><h3>순 Acceptor 농도 Na(x)</h3></div><div className="chart-legend"><span><i className="line baseline" />기준 조건</span><span><i className="line current" />입력 조건</span></div></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="깊이에 따른 순 acceptor 도핑 농도">
        {[15,16,17,18,19,20].map((tick) => <g key={tick}><line x1={left} x2={width-right} y1={y(10**tick)} y2={y(10**tick)} stroke="#d8e1e8"/><text x={left-10} y={y(10**tick)+4} textAnchor="end" fontSize="11" fill="#61747e">{`1E${tick}`}</text></g>)}
        {[0,0.1,0.2,0.3,0.4,0.5].map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={top} y2={height-bottom} stroke="#edf1f4"/><text x={x(tick)} y={height-18} textAnchor="middle" fontSize="11" fill="#61747e">{tick.toFixed(1)}</text></g>)}
        <path d={path(baselineDoping.na)} fill="none" stroke="#738293" strokeWidth="3" strokeDasharray="8 6" />
        <path d={path(inputNa)} fill="none" stroke="#00a9c7" strokeWidth="3.5" strokeLinecap="round" />
        <text x={left+chartWidth/2} y={height-2} textAnchor="middle" fontSize="12" fill="#41545e" fontWeight="700">Depth below Si surface (µm)</text>
      </svg>
    </div>
  );
}

function PotentialChart({ inputPhi }: { inputPhi: number[] }) {
  const width = 760, height = 300, left = 64, right = 22, top = 22, bottom = 40;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const depths = baselineDoping.depths;
  const allValues = [...baselinePhi, ...inputPhi].map((v) => v * 1000);
  const minV = Math.min(...allValues), maxV = Math.max(...allValues);
  const pad = (maxV - minV) * 0.12 || 5;
  const x = (depthUm: number) => left + (depthUm / 0.58) * chartWidth;
  const y = (mv: number) => top + (1 - (mv - (minV - pad)) / (maxV - minV + pad * 2)) * chartHeight;
  const path = (values: number[]) => depths.map((d, i) => `${i === 0 ? "M" : "L"}${x(d).toFixed(2)},${y(values[i]*1000).toFixed(2)}`).join(" ");
  const ticks = Array.from({ length: 5 }, (_, i) => minV - pad + ((maxV - minV + pad * 2) / 4) * i);
  return (
    <div className="chart-shell">
      <div className="chart-heading"><div><span className="eyebrow">EQUILIBRIUM POTENTIAL</span><h3>평형 전위 φ(x)</h3></div><div className="chart-legend"><span><i className="line baseline" />기준 조건</span><span><i className="line current" />입력 조건</span></div></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="깊이에 따른 평형 전위 분포">
        {ticks.map((tick) => <g key={tick}><line x1={left} x2={width-right} y1={y(tick)} y2={y(tick)} stroke="#d8e1e8"/><text x={left-10} y={y(tick)+4} textAnchor="end" fontSize="11" fill="#61747e">{tick.toFixed(0)}mV</text></g>)}
        {[0,0.1,0.2,0.3,0.4,0.5].map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={top} y2={height-bottom} stroke="#edf1f4"/><text x={x(tick)} y={height-18} textAnchor="middle" fontSize="11" fill="#61747e">{tick.toFixed(1)}</text></g>)}
        <path d={path(baselinePhi)} fill="none" stroke="#738293" strokeWidth="3" strokeDasharray="8 6" />
        <path d={path(inputPhi)} fill="none" stroke="#00a9c7" strokeWidth="3.5" strokeLinecap="round" />
        <text x={left+chartWidth/2} y={height-2} textAnchor="middle" fontSize="12" fill="#41545e" fontWeight="700">Depth below Si surface (µm)</text>
      </svg>
    </div>
  );
}

export default function ProPage() {
  const [form, setForm] = useState<Form>({ energy: "80", dose: "2.3E13" });
  const [applied, setApplied] = useState<Implant[]>([{ energy: 80, dose: 2.3e13 }]);
  const [error, setError] = useState("");

  const result = useMemo(() => analyze(applied), [applied]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const energy = Number(form.energy);
    const dose = parseDose(form.dose);
    if (!Number.isFinite(energy) || energy <= 0 || energy > 500 || !Number.isFinite(dose) || dose < 1e10 || dose > 1e16) {
      setError("Energy는 0–500 keV, Dose는 1E10–1E16 범위로 입력해 주세요.");
      return;
    }
    setError("");
    setApplied([{ energy, dose }]);
  };

  const recipeLabel = applied.map((i) => `Boron ${i.energy} keV · ${formatDose(i.dose)}`).join(" + ");

  return <main>
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true"><span/><i/></div>
      <div><p className="brand-kicker">PHYSICS ENGINE PREVIEW</p><h1>BG Cell Implant Simulator — PRO</h1></div>
      <div className="baseline-chip"><small>REFERENCE</small><strong>Boron 90 + 70 keV</strong><span>Total dose 3.0E13 cm⁻²</span></div>
    </header>
    <section className="workspace">
      <aside className="control-panel">
        <div className="panel-title"><div><span className="eyebrow">PROCESS INPUT</span><h2>Implant 조건</h2></div><Link href="/" className="step-count">메인 앱으로</Link></div>
        <form onSubmit={submit}>
          <fieldset className="implant-block">
            <legend><span>01</span> Boron Field-stop Implant</legend>
            <div className="field-grid">
              <label className="field source-field"><span>Source</span><input value="Boron (B)" disabled /></label>
              <label className="field"><span>Energy <i>keV</i></span><input inputMode="decimal" value={form.energy} onChange={(e) => setForm({ ...form, energy: e.target.value })} aria-label="Energy"/></label>
              <label className="field"><span>Dose <i>cm⁻²</i></span><input value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} aria-label="Dose"/></label>
            </div>
          </fieldset>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="analyze-button" type="submit"><span>물리 엔진 실행</span><i aria-hidden="true">→</i></button>
        </form>
        <div className="intro-footer" style={{marginTop:20}}>
          <strong>PRO 모델 범위</strong>
          <p>비선형 Poisson(Boltzmann 통계) 방정식을 Newton-Raphson으로 직접 수치해석해 평형 전위/장벽을 구하고, 여기서 Retention(발생전류)과 Cell Tr Leakage(장벽 열이온방출)를 유도합니다. GIDL은 최대 도핑 지점에 대표 역바이어스(1.2V)를 가정한 1측 급준 접합의 최대 전계를 구해 Kane band-to-band tunneling 모델로 추정합니다. 배경 도핑·발생수명·접합 바이어스 등은 교과서 수준의 대표값이며, 실제 공정 캘리브레이션 값이 아닙니다. 2D 게이트 형상, 과도상태, 활성화/확산은 포함하지 않습니다.</p>
        </div>
      </aside>
      <section className="results-panel">
        <div className="results-title"><div><span className="eyebrow">SOLVER RESULT</span><h2>비선형 Poisson 해석 결과</h2><p>{recipeLabel}</p></div></div>

        <div className="comparison-section" style={{marginTop:14}}>
          <div className="section-heading"><div><span className="eyebrow">RAW PHYSICS</span><h3>계산된 물리량</h3></div></div>
          <div className="intro-cards two-col" style={{margin:"14px 0 0"}}>
            <div><strong>장벽 높이</strong><span>{(result.barrierV*1000).toFixed(1)} mV</span><small>φ(surface) − min(φ), 필드스탑 전위 장벽</small></div>
            <div><strong>접합 최대 전계</strong><span>{(result.fieldVcm/1e6).toFixed(3)} MV/cm</span><small>peak Na 지점 · 1측 급준접합 · Vr=1.2V</small></div>
            <div><strong>발생영역 폭</strong><span>{(result.widthUm*1000).toFixed(1)} nm</span><small>Na &gt; 1.5×배경 구간</small></div>
            <div><strong>Peak Na</strong><span>{result.peakNa.toExponential(2).replace("e+","E")}</span><small>cm⁻³, 최대 순 acceptor 농도</small></div>
          </div>
        </div>

        <div className="visual-grid">
          <DopingChart inputNa={result.na} />
          <PotentialChart inputPhi={result.phi} />
        </div>

        <div className="comparison-section">
          <div className="section-heading"><div><span className="eyebrow">BASELINE = 100%</span><h3>물리 기반 특성 비교</h3></div><p>기준 조건 대비 상대 지수 (실제 방정식으로부터 유도, 곡선맞춤 아님)</p></div>
          <div className="comparison-table-wrap"><table className="comparison-table transposed">
            <thead><tr><th className="condition-col">조건</th><th>Refresh / Retention<small>높을수록 유리</small></th><th>Cell Tr Leakage<small>낮을수록 유리</small></th><th>GIDL<small>낮을수록 유리</small></th></tr></thead>
            <tbody>
              <tr><th scope="row">기준 (Base)</th><td><span className="base-score">100%</span></td><td><span className="base-score">100%</span></td><td><span className="base-score">100%</span></td></tr>
              <tr>
                <th scope="row">입력 조건</th>
                <td><div className="metric-cell"><strong className={`score ${scoreTone("retention",result.retention)}`}>{result.retention}%</strong></div></td>
                <td><div className="metric-cell"><strong className={`score ${scoreTone("leakage",result.leakage)}`}>{result.leakage}%</strong></div></td>
                <td><div className="metric-cell"><strong className={`score ${scoreTone("gidl",result.gidl)}`}>{result.gidl}%</strong></div></td>
              </tr>
            </tbody>
          </table></div>
          <p className="comparison-footnote">GIDL은 band-to-band tunneling 특성상 전계에 지수적으로 민감해 고농도에서 수치가 급격히 커질 수 있습니다. Refresh/Leakage는 Vt(열전압) 스케일의 완만한 변화를 보입니다.</p>
        </div>
      </section>
    </section>
  </main>;
}
