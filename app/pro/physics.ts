// PRO 물리 엔진: Boron field-stop implant 프로파일 위에서
// 비선형 Poisson(Boltzmann 통계) 방정식을 Newton-Raphson으로 직접 수치해석하고,
// 그 결과(장벽 높이 · 발생영역 폭)로 Retention/Leakage를, 별도의 1측 급준 접합
// 전계식 + Kane band-to-band tunneling 모델로 GIDL을 추정한다.
// 실제 TCAD가 푸는 것과 같은 방정식을 1D로 축소해 푼 것이며, 계수(배경 도핑,
// 발생수명, 역바이어스 전압 등)는 실리콘 교과서 수준의 대표값이다.

export type Implant = { energy: number; dose: number };

const Q = 1.602176634e-19; // 전자 전하, C
const K_B = 1.380649e-23; // 볼츠만 상수, J/K
const T = 300; // 절대온도, K
export const VT = (K_B * T) / Q; // 열전압, ~0.02585 V
const NI = 1.5e10; // 실리콘 진성 캐리어 농도 @300K, cm^-3 (Sze)
const EPS_SI = 11.7 * 8.8541878128e-14; // 실리콘 유전율, F/cm
const BACKGROUND_NA = 5e16; // 배경 p-well/channel 도핑, cm^-3 (대표값)

const DOMAIN_UM = 0.58; // 깊이 방향 계산 영역, µm (메인 앱과 동일 범위)
const GRID_POINTS = 241;

const ND_DRAIN = 1e20; // N+ drain/bit-line 접합 도핑, cm^-3 (대표값)
const VR_REVERSE = 1.2; // 접합에 걸리는 대표 역바이어스, V (DRAM array 전압 수준)

const TAU_G = 1e-6; // SRH 발생 수명, s (교과서 대표값)
const KANE_A = 9.66e18; // Kane BTBT 모델 계수 A, V^2 s^-1 cm^-1 (실리콘 대표값)
const KANE_B = 2.14e7; // Kane BTBT 모델 계수 B, V/cm
const EG = 1.12; // 실리콘 밴드갭 @300K, eV

function boronRpSigma(energyKeV: number) {
  const rp = 0.003 * energyKeV + 0.01;
  const sigma = Math.max(0.00075 * energyKeV + 0.0125, 0.004);
  return { rp, sigma };
}

function implantConcentration(depthUm: number, implant: Implant) {
  const { rp, sigma } = boronRpSigma(implant.energy);
  const sigmaCm = sigma * 1e-4;
  return (implant.dose / (Math.sqrt(2 * Math.PI) * sigmaCm)) * Math.exp(-0.5 * Math.pow((depthUm - rp) / sigma, 2));
}

export function buildDopingProfile(implants: Implant[]) {
  const dx = DOMAIN_UM / (GRID_POINTS - 1);
  const depths: number[] = [];
  const na: number[] = [];
  for (let i = 0; i < GRID_POINTS; i++) {
    const x = i * dx;
    let total = BACKGROUND_NA;
    for (const implant of implants) total += implantConcentration(x, implant);
    depths.push(x);
    na.push(total);
  }
  return { depths, na, dxCm: dx * 1e-4 };
}

function thomasSolve(lower: number[], diag: number[], upper: number[], rhs: number[]) {
  const n = diag.length;
  const cp = new Array(n).fill(0);
  const dp = new Array(n).fill(0);
  cp[0] = upper[0] / diag[0];
  dp[0] = rhs[0] / diag[0];
  for (let i = 1; i < n; i++) {
    const m = diag[i] - lower[i] * cp[i - 1];
    cp[i] = i < n - 1 ? upper[i] / m : 0;
    dp[i] = (rhs[i] - lower[i] * dp[i - 1]) / m;
  }
  const x = new Array(n).fill(0);
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}

// 등가(equilibrium) 비선형 Poisson 방정식을 감쇠 Newton-Raphson으로 푼다.
// d²φ/dx² = -(q/eps)·(p(φ) - n(φ) - Na(x)),  p=ni·exp(-φ/Vt), n=ni·exp(φ/Vt)
// 경계조건: 양끝 Neumann(dφ/dx=0). 초기값은 국소 전하중성 근사로 이미 해에 가깝다.
export function solveEquilibriumPotential(na: number[], dxCm: number) {
  const n = na.length;
  const phi = na.map((value) => -VT * Math.asinh(value / (2 * NI)));
  const maxStep = 5 * VT;

  for (let iter = 0; iter < 60; iter++) {
    const F = new Array(n).fill(0);
    const lower = new Array(n).fill(0);
    const diag = new Array(n).fill(0);
    const upper = new Array(n).fill(0);
    const dx2 = dxCm * dxCm;

    for (let i = 0; i < n; i++) {
      const p = NI * Math.exp(-phi[i] / VT);
      const nElec = NI * Math.exp(phi[i] / VT);
      const rhsTerm = (Q / EPS_SI) * (p - nElec - na[i]);
      const dRhsTerm = (-(Q * NI) / (EPS_SI * VT)) * (Math.exp(-phi[i] / VT) + Math.exp(phi[i] / VT));

      if (i === 0) {
        F[i] = (2 * phi[1] - 2 * phi[0]) / dx2 + rhsTerm;
        diag[i] = -2 / dx2 + dRhsTerm;
        upper[i] = 2 / dx2;
      } else if (i === n - 1) {
        F[i] = (2 * phi[n - 2] - 2 * phi[n - 1]) / dx2 + rhsTerm;
        diag[i] = -2 / dx2 + dRhsTerm;
        lower[i] = 2 / dx2;
      } else {
        F[i] = (phi[i - 1] - 2 * phi[i] + phi[i + 1]) / dx2 + rhsTerm;
        diag[i] = -2 / dx2 + dRhsTerm;
        lower[i] = 1 / dx2;
        upper[i] = 1 / dx2;
      }
    }

    const delta = thomasSolve(lower, diag, upper, F.map((value) => -value));
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      const clamped = Math.max(-maxStep, Math.min(maxStep, delta[i]));
      phi[i] += clamped;
      maxDelta = Math.max(maxDelta, Math.abs(clamped));
    }
    if (maxDelta < 1e-10) break;
  }

  return phi;
}

function barrierHeightOf(phi: number[]) {
  return phi[0] - Math.min(...phi);
}

function generationWidthUm(depths: number[], na: number[]) {
  const threshold = BACKGROUND_NA * 1.5;
  const dxUm = depths[1] - depths[0];
  return na.reduce((sum, value) => sum + (value > threshold ? dxUm : 0), 0);
}

function generationCurrent(widthUm: number) {
  const widthCm = widthUm * 1e-4;
  return (Q * NI * widthCm) / (2 * TAU_G);
}

function thermionicLeakage(barrierV: number) {
  return Math.exp(-barrierV / VT);
}

// 1측 급준(one-sided abrupt) N+/P 접합의 최대 도핑 지점에 대표 역바이어스를
// 걸었을 때의 최대 전계를 구하고, Kane 모델로 band-to-band tunneling 발생률을 낸다.
function junctionBtbtRate(peakNa: number) {
  const vbi = VT * Math.log((peakNa * ND_DRAIN) / (NI * NI));
  const fieldVcm = Math.sqrt((2 * Q * peakNa * (vbi + VR_REVERSE)) / EPS_SI);
  if (fieldVcm <= 0) return { rate: 0, fieldVcm };
  const rate = KANE_A * (Math.pow(fieldVcm, 2) / Math.sqrt(EG)) * Math.exp((-KANE_B * Math.pow(EG, 1.5)) / fieldVcm);
  return { rate, fieldVcm };
}

function rawStats(implants: Implant[]) {
  const { depths, na, dxCm } = buildDopingProfile(implants);
  const phi = solveEquilibriumPotential(na, dxCm);
  const barrierV = barrierHeightOf(phi);
  const widthUm = generationWidthUm(depths, na);
  const peakNa = Math.max(...na);
  const { rate: btbtRate, fieldVcm } = junctionBtbtRate(peakNa);
  return {
    depths,
    na,
    phi,
    barrierV,
    widthUm,
    peakNa,
    fieldVcm,
    genCurrent: generationCurrent(widthUm),
    thermionic: thermionicLeakage(barrierV),
    btbtRate,
  };
}

export const BASELINE: Implant[] = [
  { energy: 90, dose: 1.5e13 },
  { energy: 70, dose: 1.5e13 },
];

const baselineRaw = rawStats(BASELINE);

function clampPercent(value: number) {
  return Math.min(Math.max(value, 1), 5000);
}

export function analyze(implants: Implant[]) {
  const raw = rawStats(implants);
  const retention = Math.round(clampPercent((100 * baselineRaw.genCurrent) / Math.max(raw.genCurrent, 1e-30)));
  const leakage = Math.round(clampPercent((100 * raw.thermionic) / baselineRaw.thermionic));
  const gidl = Math.round(clampPercent((100 * raw.btbtRate) / Math.max(baselineRaw.btbtRate, 1e-30)));
  return { ...raw, retention, leakage, gidl };
}

export function getBaselineRaw() {
  return baselineRaw;
}
