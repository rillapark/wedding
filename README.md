# wedding

about our wedding

## 우리의 자리 — 결혼식 좌석 배치

원탁 20개, 테이블별 8/9/10석, 하객 중복 배정 방지, 엑셀 교체·저장, 좌석별 이름이 표시된 PNG 배치도 내보내기를 지원합니다. 좌측은 신부측, 우측은 신랑측입니다.

## 실행

Node.js 22 이상에서 `node scripts/serve.mjs`를 실행하고 http://localhost:3000 을 여세요. 외부 패키지 설치는 필요 없습니다. `dist` 폴더는 정적 웹 호스팅에도 올릴 수 있습니다. HTML 파일을 더블클릭하는 file:// 방식은 엑셀 자동 읽기를 지원하지 않습니다.

## 기본 엑셀 명단

**저장소 경로: `dist/data/guests.xlsx`**

기본 파일에는 가상 하객 200명이 있습니다. 파일을 같은 경로와 이름으로 교체하면 서버에서 새 파일을 읽습니다. 첫 행은 `이름`, 선택 열은 `구분`, `테이블`, `좌석`입니다. 좌석을 함께 저장하려면 페이지의 ‘배치 결과 저장’으로 내려받은 파일을 이 경로에 넣으세요. 첫 시트 또는 `하객명단` 시트를 읽습니다. `테이블설정` 시트의 `테이블`, `좌석수` 열도 지원합니다.

- 최초 방문: 기본 엑셀을 자동으로 불러옵니다.
- 명단 업로드와 배정 변경: 현재 브라우저의 localStorage에 자동 저장합니다.
- 새로고침: 저장된 명단·배정·좌석 수를 복원합니다.
- 기본 엑셀 변경: 페이지가 열려 있으면 60초마다 확인합니다. ‘기본 명단 확인’으로 즉시 확인할 수도 있습니다. 변경을 감지하면 ‘변경된 명단 적용’을 눌러 교체합니다. 작업 중인 배정은 자동으로 덮어쓰지 않습니다.
- 자동 저장은 브라우저별이며 기기 간 공동 편집이나 GitHub로의 자동 업로드가 아닙니다. 다른 기기에서는 엑셀을 불러오거나 기본 파일에 반영하세요.

## GitHub 파일 변경 반영

현재 사이트는 `https://raw.githubusercontent.com/rillapark/wedding/main/dist/data/guests.xlsx`를 직접 읽습니다. **main 브랜치의 `dist/data/guests.xlsx`를 교체하고 커밋**하면 웹사이트를 다시 배포하지 않아도 변경 감지 후 적용할 수 있습니다. GitHub의 캐시 때문에 반영까지 잠시 지연될 수 있습니다. 현재 저장소는 공개이며 실제 명단을 올리면 누구나 파일을 읽을 수 있습니다.

기존 사이트: https://wedding-table-planner-jy.workout-jyp.chatgpt.site (Sites 접근 권한은 별도)


`dist/roster-config.json`의 `url`을 기본값 `data/guests.xlsx`로 두면 **배포된 웹사이트의 파일**을 읽습니다. GitHub 파일만 바꾼 경우에는 해당 호스팅의 배포가 완료되어야 반영됩니다.

공개 저장소의 최신 엑셀을 재배포 없이 직접 읽으려면 `url`을 그 파일의 GitHub Raw HTTPS URL로 설정할 수 있습니다. 공개 URL에는 누구나 접근할 수 있으므로 실제 하객 명단의 공개 여부를 확인하세요. 비공개 GitHub 파일은 브라우저에서 인증 없이 직접 읽을 수 없습니다. GitHub 토큰을 HTML, JavaScript, JSON, URL에 넣지 마세요.

GitHub Pages 사용 시 저장소 Settings → Pages → Source에서 GitHub Actions를 선택하세요. 포함된 `.github/workflows/pages.yml`이 main 브랜치 변경 때마다 `dist` 폴더를 배포합니다. `dist/data/guests.xlsx`를 교체하고 커밋하면 배포 완료 후 자동 확인 대상이 됩니다. Pages 이용 가능 여부는 저장소 공개 설정과 GitHub 요금제에 따라 다릅니다. 사이트 소유권/공유 설정과 GitHub 저장소의 공개 여부는 별개입니다.

## Vercel 배포

이 저장소에는 `vercel.json`이 있으며 `dist` 폴더를 정적 사이트로 배포합니다. 빌드 단계는 없습니다.

1. https://vercel.com 에 GitHub 계정으로 로그인합니다.
2. **Add New... -> Project**에서 `rillapark/wedding` 저장소를 Import 합니다.
3. Framework Preset은 **Other**로 두고 그대로 **Deploy**를 누릅니다. `vercel.json`의 `outputDirectory`가 `dist`를 가리키므로 별도 설정은 필요 없습니다.
4. 배포가 끝나면 `https://<프로젝트이름>.vercel.app` 주소가 생기고, 이 주소를 공유하면 됩니다.

이후 main 브랜치에 푸시할 때마다 자동으로 다시 배포됩니다. 다른 브랜치에 푸시하면 미리보기(Preview) 배포가 따로 생성됩니다.

CLI로 배포하려면 저장소 루트에서 `npx vercel --prod`를 실행합니다. 로그인이 필요합니다.

### 명단 파일을 읽는 위치

`dist/roster-config.json`의 `url`이 현재 `https://raw.githubusercontent.com/rillapark/wedding/main/dist/data/guests.xlsx`이므로, 사이트는 **main 브랜치의 엑셀**을 읽습니다. 따라서 엑셀만 교체하면 Vercel 재배포 없이 반영됩니다. main 브랜치에 그 파일이 없으면 불러오기에 실패하고 내장된 가상 하객 200명이 그대로 표시됩니다.

Vercel이 배포한 자기 사이트의 파일을 읽게 하려면 `url`을 `data/guests.xlsx`로 바꾸세요. 이 경우에는 엑셀을 교체할 때마다 재배포가 필요합니다.

## 이미지

모든 원탁과 각 좌석의 하객 이름을 실제 시계 방향 순서로 배치합니다. 1번 좌석은 기본 1시 방향이며, 11번 테이블만 11시 방향입니다. 빈 좌석도 표시됩니다. PNG는 전체 배치도가 잘리지 않도록 고정 해상도로 생성됩니다.

## 라이선스

포함된 SheetJS 라이브러리의 라이선스는 `dist/xlsx-LICENSE.txt`를 참조하세요.
