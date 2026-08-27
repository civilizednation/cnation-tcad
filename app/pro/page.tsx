"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { BASELINE, analyze, boronRpSigma, buildDopingProfile, solveEquilibriumPotential, type Implant } from "./physics";

type Form = { energy: string; dose: string };
type ExtraCondition = Form & { id: number };

const MAX_CONDITIONS = 6;
const CONDITION_COLORS = ["#00a9c7", "#d28b14", "#118c66", "#d44a3b", "#6a5cd6", "#2f6fed"];

function parseDose(value: string) {
  const parsed = Number(value.trim().replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatDose(value: number) {
  return value.toExponential(1).replace("e+", "E").replace("e", "E");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function recipeLabelOf(implants: Implant[]) {
  return implants.map((i) => `Boron ${i.energy} keV · ${formatDose(i.dose)}`).join(" + ");
}

const baselineDoping = buildDopingProfile(BASELINE);
const baselinePhi = solveEquilibriumPotential(baselineDoping.na, baselineDoping.dxCm);

function scoreTone(metric: "retention" | "leakage" | "gidl", value: number) {
  if (metric === "retention") return value >= 100 ? "good" : value >= 85 ? "caution" : "risk";
  return value <= 110 ? "good" : value <= 250 ? "caution" : "risk";
}

function ContourSvg({ implants, idPrefix, label }: { implants: Implant[]; idPrefix: string; label: string }) {
  const glowId = `softGlow-${idPrefix}`, doseId = `doseWarm-${idPrefix}`, siliconId = `silicon-${idPrefix}`;
  return (
    <svg viewBox="0 0 640 330" role="img" aria-label={`${label} 조건의 buried gate cell transistor implant 농도 분포`}>
      <defs><filter id={glowId} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="13"/></filter><radialGradient id={doseId}><stop offset="0%" stopColor="#ef3f23" stopOpacity=".94"/><stop offset="36%" stopColor="#ffc43d" stopOpacity=".9"/><stop offset="62%" stopColor="#29d5a4" stopOpacity=".74"/><stop offset="100%" stopColor="#1f70ff" stopOpacity="0"/></radialGradient><linearGradient id={siliconId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d9e2e7"/><stop offset="100%" stopColor="#aab7bf"/></linearGradient></defs>
      <rect x="48" y="52" width="544" height="234" rx="8" fill={`url(#${siliconId})`} />
      {implants.map((implant, index) => {
        const { rp } = boronRpSigma(implant.energy);
        const cy = 52 + (rp / 0.58) * 234;
        const opacity = clamp(implant.dose / 2.6e13, 0.48, 1);
        return <g key={index}><ellipse cx="320" cy={cy} rx="184" ry="72" fill={`url(#${doseId})`} opacity={opacity} filter={`url(#${glowId})`}/><line x1="468" x2="566" y1={cy} y2={cy} stroke={index===0?"#e04f2c":"#008fb0"} strokeWidth="2" strokeDasharray="5 5"/><text x="570" y={cy+4} fontSize="12" fill="#28424f" textAnchor="end">{`${implant.energy} keV peak`}</text></g>;
      })}
      <rect x="275" y="52" width="90" height="150" fill="#11c7d4" stroke="#006f79" strokeWidth="2"/><rect x="282" y="52" width="76" height="75" fill="#9e2a22" stroke="#fff" strokeWidth="2"/><rect x="282" y="127" width="76" height="68" rx="5" fill="#c59319" stroke="#fff" strokeWidth="2"/>
      <text x="320" y="93" textAnchor="middle" fill="#fff" fontWeight="700" fontSize="15">Poly 750 Å</text><text x="320" y="168" textAnchor="middle" fill="#1a252b" fontWeight="800" fontSize="15">W 750 Å</text><text x="74" y="80" fill="#41545e" fontWeight="700" fontSize="15">Silicon Active</text>
      <line x1="250" x2="250" y1="52" y2="202" stroke="#26343b" strokeWidth="2"/><path d="M243 59 L250 52 L257 59 M243 195 L250 202 L257 195" fill="none" stroke="#26343b" strokeWidth="2"/><text x="236" y="133" transform="rotate(-90 236 133)" textAnchor="middle" fontSize="13" fill="#26343b" fontWeight="700">1500 Å</text>
    </svg>
  );
}

function DoseContourSequence({ conditions }: { conditions: { label: string; implants: Implant[]; color: string }[] }) {
  return (
    <div className="cell-shell">
      <div className="chart-heading"><div><span className="eyebrow">CELL CROSS-SECTION</span><h3>BG 주변 Dose Contour</h3></div><span className="model-pill">W 750 Å + Poly 750 Å</span></div>
      <div className="contour-sequence">
        <div className="contour-pane base"><h4>기준 조건</h4><ContourSvg implants={BASELINE} idPrefix="pro-base" label="기준" /></div>
        {conditions.map((c, index) => (
          <div className="contour-pane current" key={c.label}>
            <h4 style={{ color: c.color }}>{c.label}</h4>
            <ContourSvg implants={c.implants} idPrefix={`pro-cond-${index}`} label={c.label} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DopingChart({ conditions }: { conditions: { label: string; na: number[]; color: string }[] }) {
  const width = 760, height = 300, left = 64, right = 22, top = 22, bottom = 40;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const depths = baselineDoping.depths;
  const x = (depthUm: number) => left + (depthUm / 0.58) * chartWidth;
  const y = (value: number) => top + (1 - (Math.log10(Math.max(value, 1e15)) - 15) / 5) * chartHeight;
  const path = (values: number[]) => depths.map((d, i) => `${i === 0 ? "M" : "L"}${x(d).toFixed(2)},${y(values[i]).toFixed(2)}`).join(" ");
  return (
    <div className="chart-shell">
      <div className="chart-heading"><div><span className="eyebrow">DOPING PROFILE</span><h3>순 Acceptor 농도 Na(x)</h3></div><div className="chart-legend"><span><i className="line baseline" />기준 조건</span>{conditions.map((c) => <span key={c.label}><i className="line" style={{background:c.color}} />{c.label}</span>)}</div></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="깊이에 따른 순 acceptor 도핑 농도">
        {[15,16,17,18,19,20].map((tick) => <g key={tick}><line x1={left} x2={width-right} y1={y(10**tick)} y2={y(10**tick)} stroke="#d8e1e8"/><text x={left-10} y={y(10**tick)+4} textAnchor="end" fontSize="11" fill="#61747e">{`1E${tick}`}</text></g>)}
        {[0,0.1,0.2,0.3,0.4,0.5].map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={top} y2={height-bottom} stroke="#edf1f4"/><text x={x(tick)} y={height-18} textAnchor="middle" fontSize="11" fill="#61747e">{tick.toFixed(1)}</text></g>)}
        <path d={path(baselineDoping.na)} fill="none" stroke="#738293" strokeWidth="3" strokeDasharray="8 6" />
        {conditions.map((c) => <path key={c.label} d={path(c.na)} fill="none" stroke={c.color} strokeWidth="3" strokeLinecap="round" />)}
        <text x={left+chartWidth/2} y={height-2} textAnchor="middle" fontSize="12" fill="#41545e" fontWeight="700">Depth below Si surface (µm)</text>
      </svg>
    </div>
  );
}

function PotentialChart({ conditions }: { conditions: { label: string; phi: number[]; color: string }[] }) {
  const width = 760, height = 300, left = 64, right = 22, top = 22, bottom = 40;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const depths = baselineDoping.depths;
  const allValues = [...baselinePhi, ...conditions.flatMap((c) => c.phi)].map((v) => v * 1000);
  const minV = Math.min(...allValues), maxV = Math.max(...allValues);
  const pad = (maxV - minV) * 0.12 || 5;
  const x = (depthUm: number) => left + (depthUm / 0.58) * chartWidth;
  const y = (mv: number) => top + (1 - (mv - (minV - pad)) / (maxV - minV + pad * 2)) * chartHeight;
  const path = (values: number[]) => depths.map((d, i) => `${i === 0 ? "M" : "L"}${x(d).toFixed(2)},${y(values[i]*1000).toFixed(2)}`).join(" ");
  const ticks = Array.from({ length: 5 }, (_, i) => minV - pad + ((maxV - minV + pad * 2) / 4) * i);
  return (
    <div className="chart-shell">
      <div className="chart-heading"><div><span className="eyebrow">EQUILIBRIUM POTENTIAL</span><h3>평형 전위 φ(x)</h3></div><div className="chart-legend"><span><i className="line baseline" />기준 조건</span>{conditions.map((c) => <span key={c.label}><i className="line" style={{background:c.color}} />{c.label}</span>)}</div></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="깊이에 따른 평형 전위 분포">
        {ticks.map((tick) => <g key={tick}><line x1={left} x2={width-right} y1={y(tick)} y2={y(tick)} stroke="#d8e1e8"/><text x={left-10} y={y(tick)+4} textAnchor="end" fontSize="11" fill="#61747e">{tick.toFixed(0)}mV</text></g>)}
        {[0,0.1,0.2,0.3,0.4,0.5].map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={top} y2={height-bottom} stroke="#edf1f4"/><text x={x(tick)} y={height-18} textAnchor="middle" fontSize="11" fill="#61747e">{tick.toFixed(1)}</text></g>)}
        <path d={path(baselinePhi)} fill="none" stroke="#738293" strokeWidth="3" strokeDasharray="8 6" />
        {conditions.map((c) => <path key={c.label} d={path(c.phi)} fill="none" stroke={c.color} strokeWidth="3" strokeLinecap="round" />)}
        <text x={left+chartWidth/2} y={height-2} textAnchor="middle" fontSize="12" fill="#41545e" fontWeight="700">Depth below Si surface (µm)</text>
      </svg>
    </div>
  );
}

export default function ProPage() {
  const [implant1, setImplant1] = useState<Form>({ energy: "80", dose: "2.3E13" });
  const [implant2, setImplant2] = useState<Form>({ energy: "", dose: "" });
  const [useSecond, setUseSecond] = useState(false);
  const [extraConditions, setExtraConditions] = useState<ExtraCondition[]>([]);
  const [nextConditionId, setNextConditionId] = useState(1);
  const [limitNotice, setLimitNotice] = useState("");
  const [appliedConditions, setAppliedConditions] = useState<Implant[][]>([[{ energy: 80, dose: 2.3e13 }]]);
  const [error, setError] = useState("");

  const results = useMemo(() => appliedConditions.map(analyze), [appliedConditions]);
  const conditionMeta = appliedConditions.map((implants, index) => ({
    label: `실험 조건 ${index + 1}`,
    implants,
    result: results[index],
    color: CONDITION_COLORS[index % CONDITION_COLORS.length],
  }));
  const totalConditionCount = 1 + extraConditions.length;

  const updateExtra = (id: number, key: keyof Form, value: string) =>
    setExtraConditions((prev) => prev.map((c) => (c.id === id ? { ...c, [key]: value } : c)));
  const addCondition = () => {
    if (1 + extraConditions.length >= MAX_CONDITIONS) {
      setLimitNotice(`실험 조건은 최대 ${MAX_CONDITIONS}개까지 추가할 수 있습니다.`);
      return;
    }
    setLimitNotice("");
    setExtraConditions((prev) => [...prev, { id: nextConditionId, energy: implant1.energy, dose: implant1.dose }]);
    setNextConditionId((id) => id + 1);
  };
  const removeCondition = (id: number) => {
    setExtraConditions((prev) => prev.filter((c) => c.id !== id));
    setLimitNotice("");
  };
  const toggleSecond = (enabled: boolean) => {
    setUseSecond(enabled);
    setImplant2(enabled ? { energy: "70", dose: "1.5E13" } : { energy: "", dose: "" });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const primaryCandidates = [implant1, ...(useSecond ? [implant2] : [])];
    const groups = [primaryCandidates, ...extraConditions.map((c) => [c])];
    const parsedGroups = groups.map((group) => group.map((f) => ({ energy: Number(f.energy), dose: parseDose(f.dose) })));
    const invalid = parsedGroups.some((group) => group.some((i) => !Number.isFinite(i.energy) || i.energy <= 0 || i.energy > 500 || !Number.isFinite(i.dose) || i.dose < 1e10 || i.dose > 1e16));
    if (invalid) {
      setError("모든 실험 조건에서 Energy는 0–500 keV, Dose는 1E10–1E16 범위로 입력해 주세요.");
      return;
    }
    setError("");
    setAppliedConditions(parsedGroups);
  };

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
          <p className="condition-index-label">실험 조건 1</p>
          <fieldset className="implant-block">
            <legend><span>01</span> Boron Field-stop <b>필수</b></legend>
            <div className="field-grid">
              <label className="field source-field"><span>Source</span><input value="Boron (B)" disabled /></label>
              <label className="field"><span>Energy <i>keV</i></span><input inputMode="decimal" value={implant1.energy} onChange={(e) => setImplant1({ ...implant1, energy: e.target.value })} aria-label="Implant 1 Energy"/></label>
              <label className="field"><span>Dose <i>cm⁻²</i></span><input value={implant1.dose} onChange={(e) => setImplant1({ ...implant1, dose: e.target.value })} aria-label="Implant 1 Dose"/></label>
            </div>
          </fieldset>
          <div className="second-toggle"><div><strong>Implant 2</strong><span>2회 공정일 때만 사용</span></div><label className="switch"><input type="checkbox" checked={useSecond} onChange={(e) => toggleSecond(e.target.checked)}/><span aria-hidden="true"/><b>{useSecond?"사용":"미사용"}</b></label></div>
          <fieldset className={`implant-block secondary ${!useSecond?"disabled":""}`} disabled={!useSecond}>
            <legend><span>02</span> Implant 2 <b>선택</b></legend>
            <div className="field-grid">
              <label className="field source-field"><span>Source</span><input value={useSecond?"Boron (B)":""} placeholder="비워둠" disabled /></label>
              <label className="field"><span>Energy <i>keV</i></span><input inputMode="decimal" value={implant2.energy} onChange={(e) => setImplant2({ ...implant2, energy: e.target.value })} aria-label="Implant 2 Energy" placeholder="비워둠"/></label>
              <label className="field"><span>Dose <i>cm⁻²</i></span><input value={implant2.dose} onChange={(e) => setImplant2({ ...implant2, dose: e.target.value })} aria-label="Implant 2 Dose" placeholder="비워둠"/></label>
            </div>
          </fieldset>

          <div className="extra-conditions">
            <div className="extra-conditions-head"><span className="eyebrow">실험 조건 추가</span><span className="condition-count">{totalConditionCount} / {MAX_CONDITIONS}</span></div>
            {extraConditions.map((cond, idx) => (
              <fieldset className="implant-block extra" key={cond.id}>
                <button type="button" className="remove-condition" onClick={() => removeCondition(cond.id)} aria-label={`실험 조건 ${idx+2} 삭제`}>×</button>
                <legend><span>{idx+2}</span> 실험 조건 {idx+2}</legend>
                <div className="field-grid">
                  <label className="field source-field"><span>Source</span><input value="Boron (B)" disabled /></label>
                  <label className="field"><span>Energy <i>keV</i></span><input inputMode="decimal" value={cond.energy} onChange={(e) => updateExtra(cond.id, "energy", e.target.value)} aria-label={`실험 조건 ${idx+2} Energy`}/></label>
                  <label className="field"><span>Dose <i>cm⁻²</i></span><input value={cond.dose} onChange={(e) => updateExtra(cond.id, "dose", e.target.value)} aria-label={`실험 조건 ${idx+2} Dose`}/></label>
                </div>
              </fieldset>
            ))}
            <button type="button" className="add-condition-button" onClick={addCondition}>+ 실험 조건 추가</button>
            {limitNotice && <p className="form-error" role="alert">{limitNotice}</p>}
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="analyze-button" type="submit"><span>물리 엔진 실행</span><i aria-hidden="true">→</i></button>
        </form>
        <div className="intro-footer" style={{marginTop:20}}>
          <strong>PRO 모델 범위</strong>
          <p>비선형 Poisson(Boltzmann 통계) 방정식을 Newton-Raphson으로 직접 수치해석해 평형 전위/장벽을 구하고, 여기서 Retention(발생전류)과 Cell Tr Leakage(장벽 열이온방출)를 유도합니다. GIDL은 최대 도핑 지점에 대표 역바이어스(1.2V)를 가정한 1측 급준 접합의 최대 전계를 구해 Kane band-to-band tunneling 모델로 추정합니다. 배경 도핑·발생수명·접합 바이어스 등은 교과서 수준의 대표값이며, 실제 공정 캘리브레이션 값이 아닙니다. 2D 게이트 형상, 과도상태, 활성화/확산은 포함하지 않습니다.</p>
        </div>
      </aside>
      <section className="results-panel">
        <div className="results-title"><div><span className="eyebrow">SOLVER RESULT</span><h2>비선형 Poisson 해석 결과</h2><p>기준 조건과 모든 실험 조건을 그래프·컨투어·표에서 한 번에 비교합니다.</p></div></div>

        <div className="comparison-section" style={{marginTop:14}}>
          <div className="section-heading"><div><span className="eyebrow">RAW PHYSICS</span><h3>조건별 계산된 물리량</h3></div></div>
          <div className="comparison-table-wrap"><table className="comparison-table">
            <thead><tr><th>조건</th><th>장벽 높이</th><th>접합 최대 전계</th><th>발생영역 폭</th><th>Peak Na</th></tr></thead>
            <tbody>
              {conditionMeta.map((c) => (
                <tr key={c.label}>
                  <th scope="row" style={{color:c.color}}>{c.label}<small style={{display:"block",fontWeight:600,color:"var(--muted)"}}>{recipeLabelOf(c.implants)}</small></th>
                  <td>{(c.result.barrierV*1000).toFixed(1)} mV</td>
                  <td>{(c.result.fieldVcm/1e6).toFixed(3)} MV/cm</td>
                  <td>{(c.result.widthUm*1000).toFixed(1)} nm</td>
                  <td>{c.result.peakNa.toExponential(2).replace("e+","E")}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <div className="visual-grid">
          <DoseContourSequence conditions={conditionMeta.map((c) => ({ label: c.label, implants: c.implants, color: c.color }))} />
          <div style={{display:"grid", gap:13}}>
            <DopingChart conditions={conditionMeta.map((c) => ({ label: c.label, na: c.result.na, color: c.color }))} />
            <PotentialChart conditions={conditionMeta.map((c) => ({ label: c.label, phi: c.result.phi, color: c.color }))} />
          </div>
        </div>

        <div className="comparison-section">
          <div className="section-heading"><div><span className="eyebrow">BASELINE = 100%</span><h3>물리 기반 특성 비교</h3></div><p>기준 조건 대비 상대 지수 (실제 방정식으로부터 유도, 곡선맞춤 아님)</p></div>
          <div className="comparison-table-wrap"><table className="comparison-table transposed">
            <thead><tr><th className="condition-col">조건</th><th>Refresh / Retention<small>높을수록 유리</small></th><th>Cell Tr Leakage<small>낮을수록 유리</small></th><th>GIDL<small>낮을수록 유리</small></th></tr></thead>
            <tbody>
              <tr><th scope="row">기준 (Base)</th><td><span className="base-score">100%</span></td><td><span className="base-score">100%</span></td><td><span className="base-score">100%</span></td></tr>
              {conditionMeta.map((c) => (
                <tr key={c.label}>
                  <th scope="row">{c.label}</th>
                  <td><div className="metric-cell"><strong className={`score ${scoreTone("retention",c.result.retention)}`}>{c.result.retention}%</strong></div></td>
                  <td><div className="metric-cell"><strong className={`score ${scoreTone("leakage",c.result.leakage)}`}>{c.result.leakage}%</strong></div></td>
                  <td><div className="metric-cell"><strong className={`score ${scoreTone("gidl",c.result.gidl)}`}>{c.result.gidl}%</strong></div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="comparison-footnote">GIDL은 band-to-band tunneling 특성상 전계에 지수적으로 민감해 고농도에서 수치가 급격히 커질 수 있습니다. Refresh/Leakage는 Vt(열전압) 스케일의 완만한 변화를 보입니다.</p>
        </div>
      </section>
    </section>
  </main>;
}
