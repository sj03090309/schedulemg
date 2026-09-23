import type { Metadata } from "next";
import Link from "next/link";
import { SunMark } from "@/components/ui";

export const metadata: Metadata = { title: "개인정보처리방침 | 오늘 브리핑" };

// Google OAuth 동의 화면에 연결하는 공개 페이지. 로그인 없이 볼 수 있어야 한다.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[720px] px-5 pb-20 pt-10 text-[15px] leading-[1.75] text-ink-2">
      <p className="flex items-center gap-2 text-[17px] font-bold text-ink">
        <SunMark className="size-6" />
        오늘 브리핑
      </p>
      <h1 className="mt-6 text-[26px] font-bold tracking-[-0.02em] text-ink">개인정보처리방침</h1>
      <p className="mt-2 text-[13px] text-ink-3">시행일 2026년 9월 24일</p>

      <Section title="어떤 서비스인가요">
        오늘 브리핑은 한 사람이 자기 일정, 메일, 과제, 기억할 알림을 한 화면에서 보기 위해 만든 개인용 대시보드입니다. 로그인은 관리자가 허용한
        Google 계정만 할 수 있습니다.
      </Section>

      <Section title="Google에서 가져오는 정보">
        <ul className="list-disc space-y-1 pl-5">
          <li>Google 계정의 이메일 주소, 이름, 프로필 사진 (로그인과 계정 구분용)</li>
          <li>Gmail (읽기 전용): 최근 받은편지함 메일의 보낸 사람, 제목, 짧은 요약, 읽음 여부</li>
          <li>Google 캘린더 (읽기 전용): 오늘부터 사흘간의 일정</li>
          <li>Google 클래스룸 (읽기 전용): 수강 중인 수업, 과제와 마감일, 내 제출 상태, 최근 공지</li>
        </ul>
        <p className="mt-2">메일을 보내거나 일정을 바꾸는 등 어떤 것도 쓰거나 지우지 않습니다.</p>
      </Section>

      <Section title="어떻게 쓰고 보관하나요">
        <ul className="list-disc space-y-1 pl-5">
          <li>가져온 Google 데이터는 대시보드 화면을 그리는 데만 쓰고, 별도로 저장하지 않습니다. 서버 메모리에 몇 분 동안만 임시로 둡니다.</li>
          <li>로그인을 유지하기 위한 Google 갱신 토큰은 암호화(AES-256-GCM)해 저장소(Upstash Redis)에 보관합니다.</li>
          <li>사용자가 직접 보낸 알림, 메모, AI 사용량 기록은 저장소에 보관하며, 일반 알림은 3일, 기억할 알림은 최대 45일 뒤 자동으로 지웁니다. 인증번호가 담긴 알림은 저장하지 않습니다.</li>
          <li>광고, 판매, 분석이나 AI 모델 학습에 쓰지 않으며 다른 사람이나 회사에 넘기지 않습니다.</li>
        </ul>
        <p className="mt-2">
          이 앱이 Google API에서 받은 정보를 사용하고 다른 앱으로 전송하는 방식은{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-sky underline"
            target="_blank"
            rel="noreferrer"
          >
            Google API 서비스 사용자 데이터 정책
          </a>
          (제한적 사용 요구사항 포함)을 따릅니다.
        </p>
      </Section>

      <Section title="연결 해제와 삭제">
        대시보드의 설정에서 계정 연결을 해제하면 저장된 토큰을 지우고 Google 쪽 권한도 취소합니다.{" "}
        <a href="https://myaccount.google.com/permissions" className="text-sky underline" target="_blank" rel="noreferrer">
          Google 계정의 서드 파티 연결
        </a>
        에서 직접 권한을 없앨 수도 있습니다.
      </Section>

      <Section title="문의">
        이 서비스에 대한 문의는 Google 동의 화면에 표시되는 지원 이메일로 보내 주세요.
      </Section>

      <p className="mt-10">
        <Link href="/" className="font-medium text-sky hover:underline">
          오늘 브리핑으로 돌아가기
        </Link>
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-[17px] font-semibold text-ink">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
