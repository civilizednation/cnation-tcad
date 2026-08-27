"use client";

import { FormEvent, useMemo, useState } from "react";

type Implant = { source: string; energy: string; dose: string };
type ActiveImplant = { source: string; energy: number; dose: number };
type ExtraCondition = Implant & { id: number };

const MAX_CONDITIONS = 6;
const CONDITION_COLORS = ["#00a9c7", "#d28b14", "#118c66", "#d44a3b", "#6a5cd6", "#2f6fed"];

const BASELINE: ActiveImplant[] = [
  { source: "Boron", energy: 90, dose: 1.5e13 },
  { source: "Boron", energy: 70, dose: 1.5e13 },
];

const SOURCE_MODEL: Record<string, { label: string; rp: (energy: number) => number; sigma: (energy: number) => number }> = {
  Boron: { label: "Boron (B)", rp: (e) => 0.003 * e + 0.01, sigma: (e) => 0.00075 * e + 0.0125 },
  Phosphorus: { label: "Phosphorus (P)", rp: (e) => 0.00165 * e + 0.01, sigma: (e) => 0.00055 * e + 0.01 },
  Arsenic: { label: "Arsenic (As)", rp: (e) => 0.001 * e + 0.006, sigma: (e) => 0.00035 * e + 0.008 },
};

const PRESETS = [
  { name: "Before", energy: 90, dose: "1.5E13", second: { energy: 70, dose: "1.5E13" } },
  { name: "Case 1", energy: 80, dose: "2.0E13" },
  { name: "Case 2", energy: 80, dose: "2.3E13" },
  { name: "Case 3", energy: 80, dose: "2.6E13" },
  { name: "Case 4", energy: 90, dose: "2.0E13" },
  { name: "Case 5", energy: 90, dose: "2.3E13" },
  { name: "Case 6", energy: 90, dose: "2.6E13" },
];

const DEPTHS = Array.from({ length: 145 }, (_, index) => (0.58 * index) / 144);

function parseDose(value: string) {
  const parsed = Number(value.trim().replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function concentration(depth: number, implant: ActiveImplant) {
  const model = SOURCE_MODEL[implant.source] ?? SOURCE_MODEL.Boron;
  const rp = model.rp(implant.energy);
  const sigma = Math.max(model.sigma(implant.energy), 0.004);
  const sigmaCm = sigma * 1e-4;
  return (implant.dose / (Math.sqrt(2 * Math.PI) * sigmaCm)) * Math.exp(-0.5 * Math.pow((depth - rp) / sigma, 2));
}

function buildProfile(implants: ActiveImplant[]) {
  return DEPTHS.map((depth) => ({ depth, value: implants.reduce((sum, implant) => sum + concentration(depth, implant), 0) }));
}

function nearest(profile: ReturnType<typeof buildProfile>, depth: number) {
  return profile.reduce((best, item) => Math.abs(item.depth - depth) < Math.abs(best.depth - depth) ? item : best).value;
}

function windowArea(profile: ReturnType<typeof buildProfile>, start: number, end: number) {
  return profile.filter((item) => item.depth >= start && item.depth <= end).reduce((sum, item, index, rows) => {
    if (index === 0) return 0;
    const previous = rows[index - 1];
    return sum + ((item.value + previous.value) / 2) * (item.depth - previous.depth);
  }, 0);
}

function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), max); }

const baselineProfile = buildProfile(BASELINE);
const baselineStats = {
  bottom: nearest(baselineProfile, 0.15),
  deep: nearest(baselineProfile, 0.30),
  area: windowArea(baselineProfile, 0.15, 0.42),
  peak: Math.max(...baselineProfile.map((item) => item.value)),
};

function analyze(implants: ActiveImplant[]) {
  const profile = buildProfile(implants);
  const bottomRatio = nearest(profile, 0.15) / baselineStats.bottom;
  const deepRatio = nearest(profile, 0.30) / baselineStats.deep;
  const areaRatio = windowArea(profile, 0.15, 0.42) / baselineStats.area;
  const peakRatio = Math.max(...profile.map((item) => item.value)) / baselineStats.peak;
  const fieldStop = 0.25 * clamp(bottomRatio, 0.25, 1.45) + 0.3 * clamp(deepRatio, 0.25, 1.45) + 0.45 * clamp(areaRatio, 0.25, 1.45);
  const largestSingleDose = Math.max(...implants.map((implant) => implant.dose));
  const highDosePenalty = Math.max(0, largestSingleDose / 2.3e13 - 1) * 8;
  const retention = Math.round(clamp(100 * (0.58 + 0.42 * fieldStop) - highDosePenalty, 68, 118));
  const leakage = Math.round(clamp(100 / (0.4 + 0.6 * fieldStop) + Math.max(0, peakRatio - 1) * 12 + highDosePenalty * 0.45, 72, 148));
  const gidl = Math.round(clamp(100 * (0.56 + 0.44 / clamp(deepRatio, 0.45, 1.45)) + Math.max(0, peakRatio - 1) * 17 + highDosePenalty * 0.7, 72, 155));
  const comparable = implants.every((implant) => implant.source === "Boron");
  const btbtRisk = largestSingleDose >= 2.6e13 || peakRatio > 1.06;
  const retentionLabel = retention < 91 ? "저하 예상" : retention < 98 ? "소폭 저하 가능" : retention <= 103 ? "기준과 유사" : "개선 가능";
  const leakageLabel = leakage < 95 ? "감소 예상" : leakage <= 105 ? "기준과 유사" : leakage <= 116 ? "소폭 증가 가능" : "증가 예상";
  const gidlLabel = gidl < 95 ? "감소 예상" : gidl <= 105 ? "기준과 유사" : gidl <= 116 ? "소폭 증가 가능" : "증가 예상";
  return { profile, retention, leakage, gidl, retentionLabel, leakageLabel, gidlLabel, bottomRatio, deepRatio, areaRatio, peakRatio, btbtRisk, comparable };
}

function formatDose(value: number) { return value.toExponential(1).replace("e+", "E").replace("e", "E"); }

function ProfileChart({ conditions }: { conditions: { label: string; profile: ReturnType<typeof buildProfile>; color: string }[] }) {
  const width = 760, height = 320, left = 64, right = 22, top = 22, bottom = 48;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const x = (depth: number) => left + (depth / 0.58) * chartWidth;
  const y = (value: number) => top + (1 - (Math.log10(Math.max(value, 1e13)) - 13) / 5.4) * chartHeight;
  const path = (profile: ReturnType<typeof buildProfile>) => profile.map((item, index) => `${index === 0 ? "M" : "L"}${x(item.depth).toFixed(2)},${y(item.value).toFixed(2)}`).join(" ");
  return (
    <div className="chart-shell">
      <div className="chart-heading"><div><span className="eyebrow">1D PROFILE</span><h3>깊이별 농도 비교</h3></div><div className="chart-legend" aria-label="그래프 범례"><span><i className="line baseline" />기준 조건</span>{conditions.map((c) => <span key={c.label}><i className="line" style={{background:c.color}} />{c.label}</span>)}</div></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="실리콘 깊이에 따른 기준 및 실험 조건별 implant 농도 프로파일">
        <rect x={x(0)} y={top} width={x(0.15) - x(0)} height={chartHeight} rx="8" fill="#dbe7ee" opacity="0.58" />
        {[13,14,15,16,17,18].map((tick) => <g key={tick}><line x1={left} x2={width-right} y1={y(10**tick)} y2={y(10**tick)} stroke="#d8e1e8"/><text x={left-10} y={y(10**tick)+4} textAnchor="end">{`1E${tick}`}</text></g>)}
        {[0,0.1,0.2,0.3,0.4,0.5].map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={top} y2={height-bottom} stroke="#edf1f4"/><text x={x(tick)} y={height-20} textAnchor="middle">{tick.toFixed(1)}</text></g>)}
        <path d={path(baselineProfile)} fill="none" stroke="#738293" strokeWidth="3" strokeDasharray="8 6" />
        {conditions.map((c) => <path key={c.label} d={path(c.profile)} fill="none" stroke={c.color} strokeWidth="3" strokeLinecap="round" />)}
        <line x1={x(0.15)} x2={x(0.15)} y1={top} y2={height-bottom} stroke="#52636e" strokeDasharray="4 4" />
        <text x={x(0.075)} y={top+18} textAnchor="middle" className="region-label">BG 0–0.15 µm</text>
        <text x={left+chartWidth/2} y={height-2} textAnchor="middle" className="axis-label">Depth below Si surface (µm)</text>
      </svg>
    </div>
  );
}

function ContourSvg({ implants, idPrefix, label }: { implants: ActiveImplant[]; idPrefix: string; label: string }) {
  const glowId = `softGlow-${idPrefix}`, doseId = `doseWarm-${idPrefix}`, siliconId = `silicon-${idPrefix}`;
  return (
    <svg viewBox="0 0 640 330" role="img" aria-label={`${label} 조건의 buried gate cell transistor implant 농도 분포`}>
      <defs><filter id={glowId} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="13"/></filter><radialGradient id={doseId}><stop offset="0%" stopColor="#ef3f23" stopOpacity=".94"/><stop offset="36%" stopColor="#ffc43d" stopOpacity=".9"/><stop offset="62%" stopColor="#29d5a4" stopOpacity=".74"/><stop offset="100%" stopColor="#1f70ff" stopOpacity="0"/></radialGradient><linearGradient id={siliconId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d9e2e7"/><stop offset="100%" stopColor="#aab7bf"/></linearGradient></defs>
      <rect x="48" y="52" width="544" height="234" rx="8" fill={`url(#${siliconId})`} />
      {implants.map((implant,index) => { const model=SOURCE_MODEL[implant.source]??SOURCE_MODEL.Boron; const cy=52+(model.rp(implant.energy)/.58)*234; const opacity=clamp(implant.dose/2.6e13,.48,1); return <g key={`${implant.source}-${implant.energy}-${index}`}><ellipse cx="320" cy={cy} rx="184" ry="72" fill={`url(#${doseId})`} opacity={opacity} filter={`url(#${glowId})`}/><line x1="468" x2="566" y1={cy} y2={cy} stroke={index===0?"#e04f2c":"#008fb0"} strokeWidth="2" strokeDasharray="5 5"/><text x="570" y={cy+4} fontSize="12" fill="#28424f" textAnchor="end">{`${implant.energy} keV peak`}</text></g>; })}
      <rect x="275" y="52" width="90" height="150" fill="#11c7d4" stroke="#006f79" strokeWidth="2"/><rect x="282" y="52" width="76" height="75" fill="#9e2a22" stroke="#fff" strokeWidth="2"/><rect x="282" y="127" width="76" height="68" rx="5" fill="#c59319" stroke="#fff" strokeWidth="2"/>
      <text x="320" y="93" textAnchor="middle" fill="#fff" fontWeight="700" fontSize="15">Poly 750 Å</text><text x="320" y="168" textAnchor="middle" fill="#1a252b" fontWeight="800" fontSize="15">W 750 Å</text><text x="74" y="80" fill="#41545e" fontWeight="700" fontSize="15">Silicon Active</text>
      <line x1="250" x2="250" y1="52" y2="202" stroke="#26343b" strokeWidth="2"/><path d="M243 59 L250 52 L257 59 M243 195 L250 202 L257 195" fill="none" stroke="#26343b" strokeWidth="2"/><text x="236" y="133" transform="rotate(-90 236 133)" textAnchor="middle" fontSize="13" fill="#26343b" fontWeight="700">1500 Å</text>
    </svg>
  );
}

function DoseContourSequence({ baseline, conditions }: { baseline: ActiveImplant[]; conditions: { label: string; implants: ActiveImplant[]; color: string }[] }) {
  return (
    <div className="cell-shell">
      <div className="chart-heading"><div><span className="eyebrow">CELL CROSS-SECTION</span><h3>BG 주변 Dose Contour</h3></div><span className="model-pill">W 750 Å + Poly 750 Å</span></div>
      <div className="contour-sequence">
        <div className="contour-pane base"><h4>기준 조건</h4><ContourSvg implants={baseline} idPrefix="seq-base" label="기준" /></div>
        {conditions.map((c, index) => (
          <div className="contour-pane current" key={c.label}>
            <h4 style={{color:c.color}}>{c.label}</h4>
            <ContourSvg implants={c.implants} idPrefix={`seq-cond-${index}`} label={c.label} />
          </div>
        ))}
      </div>
    </div>
  );
}

function conditionSummary(implants: ActiveImplant[]) {
  return {
    steps: implants.length,
    recipe: implants.map((implant) => `${implant.source} ${implant.energy} keV · ${formatDose(implant.dose)}`).join(" + "),
    totalDose: formatDose(implants.reduce((sum, implant) => sum + implant.dose, 0)),
  };
}

function scoreTone(metric: "refresh" | "leakage" | "gidl", value: number) {
  if (metric === "refresh") return value >= 98 ? "good" : value >= 91 ? "caution" : "risk";
  return value <= 105 ? "good" : value <= 116 ? "caution" : "risk";
}

const METRICS = [
  { key: "refresh" as const, label: "Refresh / Retention", direction: "높을수록 유리" },
  { key: "leakage" as const, label: "Cell Tr Leakage", direction: "낮을수록 유리" },
  { key: "gidl" as const, label: "GIDL", direction: "낮을수록 유리" },
];

function metricValue(result: ReturnType<typeof analyze>, key: "refresh" | "leakage" | "gidl") {
  return key === "refresh" ? result.retention : key === "leakage" ? result.leakage : result.gidl;
}

function metricNote(result: ReturnType<typeof analyze>, key: "refresh" | "leakage" | "gidl") {
  return key === "refresh" ? result.retentionLabel : key === "leakage" ? result.leakageLabel : result.gidlLabel;
}

function PerformanceComparison({ conditions }: { conditions: { label: string; result: ReturnType<typeof analyze> }[] }) {
  return <section className="comparison-section" aria-labelledby="comparison-title">
    <div className="section-heading"><div><span className="eyebrow">BASELINE = 100%</span><h3 id="comparison-title">주요 특성 비교</h3></div><p>기준 조건과 모든 실험 조건을 각 특성별로 한눈에 비교합니다.</p></div>
    <div className="comparison-table-wrap"><table className="comparison-table transposed">
      <thead><tr><th className="condition-col">조건</th>{METRICS.map((metric) => <th key={metric.key}>{metric.label}<small>{metric.direction}</small></th>)}</tr></thead>
      <tbody>
        <tr><th scope="row">기준 (Base)</th>{METRICS.map((metric) => <td key={metric.key}><span className="base-score">100%</span></td>)}</tr>
        {conditions.map((condition) => <tr key={condition.label}><th scope="row">{condition.label}</th>{METRICS.map((metric) => { const value=metricValue(condition.result,metric.key); const delta=value-100; const tone=scoreTone(metric.key,value); return <td key={metric.key}><div className="metric-cell"><strong className={`score ${tone}`}>{value}%</strong><span className={`delta ${delta===0?"same":delta>0?"up":"down"}`}>{delta===0?"동일":`${delta>0?"+":""}${delta}%p`}</span><span className={`judgement ${tone}`}>{metricNote(condition.result,metric.key)}</span></div></td>; })}</tr>)}
      </tbody>
    </table></div>
    <p className="comparison-footnote">Refresh는 높을수록 유리하며, Cell Tr Leakage와 GIDL은 낮을수록 유리합니다. 수치는 Gaussian 기반 간이 모델의 상대 예상값입니다.</p>
  </section>;
}

export default function Home() {
  const [implant1,setImplant1]=useState<Implant>({source:"Boron",energy:"80",dose:"2.3E13"});
  const [implant2,setImplant2]=useState<Implant>({source:"",energy:"",dose:""});
  const [useSecond,setUseSecond]=useState(false);
  const [extraConditions,setExtraConditions]=useState<ExtraCondition[]>([]);
  const [nextConditionId,setNextConditionId]=useState(1);
  const [limitNotice,setLimitNotice]=useState("");
  const [appliedConditions,setAppliedConditions]=useState<ActiveImplant[][]>([[{source:"Boron",energy:80,dose:2.3e13}]]);
  const [error,setError]=useState("");
  const results=useMemo(()=>appliedConditions.map(analyze),[appliedConditions]);
  const baselineSummary=conditionSummary(BASELINE);
  const update=(setter:(value:Implant)=>void,current:Implant,key:keyof Implant,value:string)=>setter({...current,[key]:value});
  const updateExtra=(id:number,key:keyof Implant,value:string)=>setExtraConditions(prev=>prev.map(c=>c.id===id?{...c,[key]:value}:c));
  const addCondition=()=>{ if(1+extraConditions.length>=MAX_CONDITIONS){setLimitNotice(`실험 조건은 최대 ${MAX_CONDITIONS}개까지 추가할 수 있습니다.`);return;} setLimitNotice(""); setExtraConditions(prev=>[...prev,{id:nextConditionId,source:"Boron",energy:"",dose:""}]); setNextConditionId(id=>id+1); };
  const removeCondition=(id:number)=>{ setExtraConditions(prev=>prev.filter(c=>c.id!==id)); setLimitNotice(""); };
  const submit=(event:FormEvent)=>{
    event.preventDefault();
    const primaryCandidates=[implant1,...(useSecond?[implant2]:[])];
    const groups=[primaryCandidates,...extraConditions.map(c=>[c])];
    const parsedGroups=groups.map(group=>group.map(i=>({source:i.source,energy:Number(i.energy),dose:parseDose(i.dose)})));
    const invalid=parsedGroups.some(group=>group.some(i=>!i.source||!Number.isFinite(i.energy)||i.energy<=0||i.energy>500||!Number.isFinite(i.dose)||i.dose<1e10||i.dose>1e16));
    if(invalid){setError("모든 실험 조건에서 Source를 선택하고 Energy는 0–500 keV, Dose는 1E10–1E16 범위로 입력해 주세요.");return;}
    setError("");
    setAppliedConditions(parsedGroups);
  };
  const toggleSecond=(enabled:boolean)=>{setUseSecond(enabled);setImplant2(enabled?{source:"Boron",energy:"70",dose:"1.5E13"}:{source:"",energy:"",dose:""});};
  const applyPreset=(preset:(typeof PRESETS)[number])=>{setImplant1({source:"Boron",energy:String(preset.energy),dose:preset.dose});if(preset.second){setUseSecond(true);setImplant2({source:"Boron",energy:String(preset.second.energy),dose:preset.second.dose});}else{setUseSecond(false);setImplant2({source:"",energy:"",dose:""});}};
  const totalConditionCount=1+extraConditions.length;
  const conditionMeta=appliedConditions.map((implants,index)=>({label:`실험 조건 ${index+1}`,implants,result:results[index],color:CONDITION_COLORS[index%CONDITION_COLORS.length]}));
  const riskConditions=conditionMeta.filter(c=>c.result.btbtRisk);
  const mismatchConditions=conditionMeta.filter(c=>!c.result.comparable);
  return <main>
    <header className="app-header"><div className="brand-mark" aria-hidden="true"><span/><i/></div><div><p className="brand-kicker">DRAM DEVICE WORKBENCH</p><h1>BG Cell Implant Simulator</h1></div><div className="baseline-chip"><small>REFERENCE</small><strong>Boron 90 + 70 keV</strong><span>Total dose 3.0E13 cm⁻²</span></div></header>
    <section className="workspace">
      <aside className="control-panel"><div className="panel-title"><div><span className="eyebrow">PROCESS INPUT</span><h2>Implant 조건</h2></div><span className="step-count">{useSecond?"2 steps":"1 step"}</span></div>
        <form onSubmit={submit}>
          <p className="condition-index-label">실험 조건 1</p>
          <fieldset className="implant-block"><legend><span>01</span> Implant 1 <b>필수</b></legend><div className="field-grid"><label className="field source-field"><span>Source</span><select value={implant1.source} onChange={e=>update(setImplant1,implant1,"source",e.target.value)}>{Object.entries(SOURCE_MODEL).map(([v,m])=><option value={v} key={v}>{m.label}</option>)}</select></label><label className="field"><span>Energy <i>keV</i></span><input inputMode="decimal" value={implant1.energy} onChange={e=>update(setImplant1,implant1,"energy",e.target.value)} aria-label="Implant 1 Energy"/></label><label className="field"><span>Dose <i>cm⁻²</i></span><input value={implant1.dose} onChange={e=>update(setImplant1,implant1,"dose",e.target.value)} aria-label="Implant 1 Dose"/></label></div></fieldset>
          <div className="second-toggle"><div><strong>Implant 2</strong><span>2회 공정일 때만 사용</span></div><label className="switch"><input type="checkbox" checked={useSecond} onChange={e=>toggleSecond(e.target.checked)}/><span aria-hidden="true"/><b>{useSecond?"사용":"미사용"}</b></label></div>
          <fieldset className={`implant-block secondary ${!useSecond?"disabled":""}`} disabled={!useSecond}><legend><span>02</span> Implant 2 <b>선택</b></legend><div className="field-grid"><label className="field source-field"><span>Source</span><select value={implant2.source} onChange={e=>update(setImplant2,implant2,"source",e.target.value)}>{!implant2.source&&<option value="">비워둠</option>}{Object.entries(SOURCE_MODEL).map(([v,m])=><option value={v} key={v}>{m.label}</option>)}</select></label><label className="field"><span>Energy <i>keV</i></span><input inputMode="decimal" value={implant2.energy} onChange={e=>update(setImplant2,implant2,"energy",e.target.value)} aria-label="Implant 2 Energy" placeholder="비워둠"/></label><label className="field"><span>Dose <i>cm⁻²</i></span><input value={implant2.dose} onChange={e=>update(setImplant2,implant2,"dose",e.target.value)} aria-label="Implant 2 Dose" placeholder="비워둠"/></label></div></fieldset>

          <div className="extra-conditions">
            <div className="extra-conditions-head"><span className="eyebrow">실험 조건 추가</span><span className="condition-count">{totalConditionCount} / {MAX_CONDITIONS}</span></div>
            {extraConditions.map((cond,idx)=>(
              <fieldset className="implant-block extra" key={cond.id}>
                <button type="button" className="remove-condition" onClick={()=>removeCondition(cond.id)} aria-label={`실험 조건 ${idx+2} 삭제`}>×</button>
                <legend><span>{idx+2}</span> 실험 조건 {idx+2}</legend>
                <div className="field-grid">
                  <label className="field source-field"><span>Source</span><select value={cond.source} onChange={e=>updateExtra(cond.id,"source",e.target.value)}>{Object.entries(SOURCE_MODEL).map(([v,m])=><option value={v} key={v}>{m.label}</option>)}</select></label>
                  <label className="field"><span>Energy <i>keV</i></span><input inputMode="decimal" value={cond.energy} onChange={e=>updateExtra(cond.id,"energy",e.target.value)} aria-label={`실험 조건 ${idx+2} Energy`}/></label>
                  <label className="field"><span>Dose <i>cm⁻²</i></span><input value={cond.dose} onChange={e=>updateExtra(cond.id,"dose",e.target.value)} aria-label={`실험 조건 ${idx+2} Dose`}/></label>
                </div>
              </fieldset>
            ))}
            <button type="button" className="add-condition-button" onClick={addCondition}>+ 실험 조건 추가</button>
            {limitNotice&&<p className="form-error" role="alert">{limitNotice}</p>}
          </div>

          {error&&<p className="form-error" role="alert">{error}</p>}<button className="analyze-button" type="submit"><span>분석 실행</span><i aria-hidden="true">→</i></button>
        </form>
        <div className="preset-area"><span className="eyebrow">QUICK PRESET</span><div className="preset-grid">{PRESETS.map(p=><button key={p.name} type="button" onClick={()=>applyPreset(p)}>{p.name}</button>)}</div><p>Preset 선택 후 <strong>분석 실행</strong>을 눌러 적용합니다.</p></div>
      </aside>
      <section className="results-panel"><div className="results-title"><div><span className="eyebrow">SIMULATION RESULT</span><h2>기준 조건 대비 예상 결과</h2><p>기준 조건과 모든 실험 조건을 그래프·컨투어·표에서 한 번에 비교합니다.</p></div></div>
        <div className="condition-result-block baseline-block">
          <div className="condition-result-head"><strong>기준 조건</strong><span>{baselineSummary.recipe}</span></div>
          <article className="condition-card base standalone"><div className="condition-label"><span>BASE</span><strong>현재 기준 조건</strong></div><p>{baselineSummary.recipe}</p><div><span>{baselineSummary.steps}회 Implant</span><b>Total {baselineSummary.totalDose} cm⁻²</b></div></article>
        </div>
        {riskConditions.length>0&&<div className="risk-banner"><span>!</span><div><strong>고농도 접합 전계 확인 필요</strong><p>{riskConditions.map(c=>c.label).join(", ")}에서 Ioff가 감소해도 GIDL, BTBT 또는 TAT leakage가 증가할 수 있습니다.</p></div></div>}
        {mismatchConditions.length>0&&<div className="risk-banner neutral"><span>i</span><div><strong>기준 Source와 다른 조건이 있습니다</strong><p>{mismatchConditions.map(c=>c.label).join(", ")}은 Boron 기준 refresh·leakage 지수가 방향성 참고용입니다.</p></div></div>}
        <div className="visual-grid">
          <DoseContourSequence baseline={BASELINE} conditions={conditionMeta.map(c=>({label:c.label,implants:c.implants,color:c.color}))}/>
          <ProfileChart conditions={conditionMeta.map(c=>({label:c.label,profile:c.result.profile,color:c.color}))}/>
        </div>
        <PerformanceComparison conditions={conditionMeta.map(c=>({label:c.label,result:c.result}))}/>
        <div className="method-note"><strong>모델 범위</strong><p>Gaussian projected-range proxy로 dose profile을 계산하고, trench bottom·deep region 농도를 기준 조건과 비교해 Refresh, Cell Tr Leakage 및 GIDL 상대지수를 추정합니다. Anneal diffusion, activation, channeling, tilt, mask screening, Vth, DIBL, BTBT 전계해석은 포함하지 않습니다.</p></div>
      </section>
    </section>
    <section className="app-intro" aria-labelledby="app-intro-title">
      <h2 id="app-intro-title">Simulation App 소개</h2>

      <article className="intro-panel">
        <div className="intro-hero">
          <span className="eyebrow">DRAM DEVICE · IMPLANT SCREENING</span>
          <h3>물리 기반 모델로 비교하는 Implant 공정 영향</h3>
          <p>Dose Profile부터 Refresh · Leakage · GIDL까지</p>
        </div>
        <div className="intro-callout"><span className="badge">OK</span><div><strong>임의 수치가 아닌 Physics-informed 상대평가</strong><p>검증된 물리 개념으로 실험 후보의 우선순위를 선별합니다.</p></div></div>
        <div className="intro-block">
          <h4><span>01</span> 모델 사용 목적</h4>
          <p>다수의 Implant 조건을 동일한 기준으로 빠르게 비교해 상세 TCAD와 Wafer DOE 이전에 유망 조건을 선별합니다. 현재 Base 조건을 100%로 정규화하여 변화 방향을 일관되게 보여줍니다.</p>
          <div className="intro-flow">
            <span>공정 조건 입력<small>Source · Energy · Dose</small></span><i>›</i>
            <span>물리 기반 계산<small>Profile · Region index</small></span><i>›</i>
            <span>상대 특성 비교<small>Base = 100%</small></span>
          </div>
        </div>
        <div className="intro-block">
          <h4><span>02</span> Dose Profile 계산 근거</h4>
          <p>이온주입 해석에서 널리 쓰이는 Projected Range(Rp)와 Range Straggle(sigma)을 적용하고, 깊이 방향 농도를 Gaussian analytical profile로 계산합니다.</p>
          <div className="intro-formula">C(x) = Q / [√(2π) · σ] · exp[-(x-Rp)² / (2σ²)]<small>Q: Implant Dose · x: Silicon depth · 2회 Implant는 두 Profile 중첩</small></div>
        </div>
        <div className="intro-block">
          <h4><span>03</span> Device 특성 평가 방법</h4>
          <p>Peak 하나가 아니라 Dual BG 구조의 핵심 영역을 분리해 비교합니다.</p>
          <div className="intro-cards">
            <div><strong>Trench Bottom</strong><span>BG 하단 전계와 Channel 제어</span></div>
            <div><strong>Deep Field-stop</strong><span>깊은 Punch-through 경로 억제</span></div>
            <div><strong>Profile Coverage</strong><span>주요 구간의 전체 농도 확보</span></div>
            <div><strong>Peak Concentration</strong><span>고농도 접합 전계 위험 감시</span></div>
          </div>
          <div className="intro-metric-tags">
            <span className="good">Refresh<small>높을수록 유리 · BASE 대비 상대지수</small></span>
            <span className="caution">Cell Tr Leakage<small>낮을수록 유리 · BASE 대비 상대지수</small></span>
            <span className="risk">GIDL<small>낮을수록 유리 · BASE 대비 상대지수</small></span>
          </div>
        </div>
        <div className="intro-footer"><strong>ENGINEERING SCREENING TOOL</strong><p>상용 TCAD를 대체하는 절대값 예측이 아니라 상세해석과 실험 범위를 줄이기 위한 물리 기반 사전평가 모델입니다.</p></div>
      </article>

      <article className="intro-panel">
        <div className="intro-hero">
          <span className="eyebrow">APPLICATION ARCHITECTURE</span>
          <h3>애플리케이션 구성과 계산 모델의 역할</h3>
          <p>입력부터 계산·시각화·배포까지 하나의 일관된 흐름</p>
        </div>
        <div className="intro-core"><span>CORE ENGINE</span><strong>app/page.tsx</strong><p>Implant 입력 · Profile 계산 · Base 정규화 · 특성 평가 · 결과 시각화</p></div>
        <div className="intro-cards two-col">
          <div><strong>BASELINE</strong><span>현재 기준 조건</span><small>90 + 70 keV, Base 100%</small></div>
          <div><strong>SOURCE_MODEL</strong><span>이온종별 분포</span><small>Rp와 sigma 산출</small></div>
          <div><strong>concentration()</strong><span>깊이별 농도</span><small>Gaussian Profile 계산</small></div>
          <div><strong>buildProfile()</strong><span>Profile 중첩</span><small>1회 또는 2회 Implant</small></div>
          <div><strong>analyze()</strong><span>특성 상대평가</span><small>Refresh · Leakage · GIDL</small></div>
          <div><strong>Chart · Contour · Table</strong><span>결과 시각화</span><small>그래프 · 단면 · 비교표</small></div>
        </div>
        <div className="intro-table-wrap">
          <table className="intro-table">
            <thead><tr><th>파일</th><th>주요 기능</th></tr></thead>
            <tbody>
              <tr><td>app/page.tsx</td><td>계산 모델, 입력 UI, Profile과 성능 비교</td></tr>
              <tr><td>app/globals.css</td><td>카드·그래프·테이블과 모바일 디자인</td></tr>
              <tr><td>app/layout.tsx</td><td>제목, 설명, 언어와 공유 메타데이터</td></tr>
              <tr><td>package.json</td><td>실행환경과 빌드 명령 정의</td></tr>
              <tr><td>vite.config.ts</td><td>개발·배포용 빌드 환경 설정</td></tr>
              <tr><td>.openai/hosting.json</td><td>배포 프로젝트 연결정보 관리</td></tr>
              <tr><td>public/*</td><td>아이콘과 링크 공유용 대표 이미지</td></tr>
              <tr><td>scripts/build-verified.sh</td><td>배포 전 정상 빌드 여부 검증</td></tr>
            </tbody>
          </table>
        </div>
        <div className="intro-flow"><span>조건 입력</span><i>›</i><span>Profile 계산</span><i>›</i><span>Base 정규화</span><i>›</i><span>특성 평가</span><i>›</i><span>시각화</span></div>
        <div className="intro-footer"><strong>동일 입력 · 동일 계산 · 동일 결과</strong><p>계산 로직과 화면 표현을 분리해 재현성과 유지보수성을 확보합니다.</p></div>
      </article>
    </section>
  </main>;
}
