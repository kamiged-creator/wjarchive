# 복작소 독립 채팅 PWA

- Vercel `bokjakso-chat-pwa` 프로젝트의 루트 디렉터리: `chat-pwa`
- 시작 화면 `/chat.html`; 기존 채팅방, 비밀번호, 공통 프로필 및 대화는 보존
- 앱 설치 아이콘: 福 말풍선; 기존 복작소 홈페이지와는 별도 PWA
- `/api/store-inquiries`, `/api/content-admin`, `/api/admin-session`은 기존 bokjakso.com 서버로 프록시
- 클럽 전용 **새 Vercel 함수는 추가하지 않음** (Hobby 요금제 함수 수 제한 회피)
- 개인정보와 대화는 서비스 워커에 캐시하지 않음
- 관리자: `/admin-login.html` -> `/chat-admin.html` -> `/club-admin.html`

## 복작소 클럽

- 일반 채팅방: 기존처럼 누구나 이용 가능 (방 자체의 입장 비밀번호 정책은 그대로)
- 클럽: 기존 채팅 공통 프로필로 가입 신청 → 관리자 승인 → 회원 전용 메시지
- 거절된 회원은 재신청 가능, 활동 제한된 회원은 재신청 불가
- 회원 상태 및 메시지 API 모두 서버에서 프로필 토큰을 검증
- 서버 관리자 요청은 기존 관리자 로그인 토큰을 검증
- 개인정보/권한 데이터는 별도 `bokjakso_club_members` 테이블, 메시지는 `bokjakso_club_messages` 테이블
- SQL 구조: 저장소 `bokjakso-club-schema.sql`
- 기존 일반 채팅 데이터와 무관한 신규 테이블이며 RLS 활성화
- 프로필은 기존처럼 **기기/브라우저에 저장된 개인 토큰**을 사용. 다른 기기에서 자동 로그인이나 비밀번호로 계정을 복구하는 기능은 아직 없음
- 클럽 메시지는 최근 60개를 표시하며 회원 권한은 각 읽기/전송 요청마다 서버에서 확인

## 배포 주의

- 동일 저장소를 `wjarchive`(API, bokjakso.com)와 `bokjakso-chat-pwa`(UI) 두 프로젝트가 참조합니다.
- 양쪽 모두 배포되고 SQL 적용된 상태여야 실제 회원 신청과 승인 기능이 작동합니다.
- 미리보기 빌드가 READY여도 API 실사용 테스트(가입 → 관리자 승인 → 채팅 → 이용제한)는 별도 확인 필요.
