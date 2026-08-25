# BG Cell Implant Simulator

DRAM BG Cell의 implant 조건을 입력하고 기준 공정 대비 다음 항목을 간단히 비교하는 웹앱입니다.

- 깊이별 implant dose profile
- BG 단면 dose contour
- Refresh / Retention 상대지수
- Cell transistor leakage 상대지수

## 기준 조건

| Step | Source | Energy | Dose |
| --- | --- | ---: | ---: |
| Implant 1 | Boron | 90 keV | 1.5E13 cm⁻² |
| Implant 2 | Boron | 70 keV | 1.5E13 cm⁻² |

기준 조건의 Refresh 및 Leakage 상대지수는 각각 100입니다.

## 실행 방법

Node.js 22.13.0 이상이 필요합니다.

```bash
npm install
npm run dev
```

프로덕션 빌드:

```bash
npm run build
```

## 배포

표준 Next.js 앱이므로 Vercel에서 이 저장소(`civilizednation/cnation-tcad`)를 그대로 Import하면 별도 설정 없이 빌드/배포됩니다 (Build Command: `next build`, Output: `.next`).

## 주요 파일

- `app/page.tsx`: 계산 모델, 입력 UI, SVG dose profile 및 cell contour
- `app/globals.css`: 전체 화면 스타일과 반응형 레이아웃
- `app/layout.tsx`: 페이지 제목, 설명 및 소셜 미리보기 설정
- `public/og.png`: 소셜 미리보기 이미지

## 모델 제한

이 앱은 Gaussian projected-range proxy를 사용한 정성적 비교 도구입니다. 실제 TCAD 결과가 아니며 anneal diffusion, activation, channeling, tilt, mask screening, Vth, DIBL 및 정확한 BTBT 전계해석은 포함하지 않습니다.

공정 조건을 확정할 때는 calibrated process/device TCAD와 고온 retention 및 leakage 실측 결과를 사용해야 합니다.
