import { mapLimit, settle } from "../concurrency";
import { clampText } from "../text";
import { DAY } from "../time";
import type { GoogleAccount } from "./accounts";
import { gget } from "./client";
import { hasAnnouncementScope } from "./oauth";

export interface Assignment {
  id: string;
  account: string;
  courseId: string;
  course: string;
  title: string;
  /** ISO 시각. 마감일이 없으면 null */
  due: string | null;
  /** 교사가 마감 시각까지 정했는지 (없으면 그날 23:59로 본다) */
  dueHasTime: boolean;
  submitted: boolean;
  late: boolean;
  link: string;
  createdAt: string;
  points?: number;
}

export interface Announcement {
  id: string;
  account: string;
  course: string;
  text: string;
  createdAt: string;
  link: string;
}

export interface ClassroomData {
  assignments: Assignment[];
  announcements: Announcement[];
  courseCount: number;
}

interface CoursesResponse {
  courses?: { id: string; name: string; section?: string }[];
}

interface GCourseWork {
  id: string;
  title?: string;
  alternateLink?: string;
  creationTime?: string;
  dueDate?: { year?: number; month?: number; day?: number };
  dueTime?: { hours?: number; minutes?: number };
  maxPoints?: number;
}

interface SubmissionsResponse {
  studentSubmissions?: { courseWorkId: string; state?: string; late?: boolean }[];
}

interface AnnouncementsResponse {
  announcements?: { id: string; text?: string; creationTime?: string; alternateLink?: string }[];
}

const BASE = "https://classroom.googleapis.com/v1";
const pad = (n: number) => String(n).padStart(2, "0");

/** Classroom의 dueDate/dueTime은 UTC다. 시각이 비어 있으면 그날 23:59(KST)로 본다. */
export function resolveDue(work: Pick<GCourseWork, "dueDate" | "dueTime">): { due: Date | null; hasTime: boolean } {
  const d = work.dueDate;
  if (!d?.year || !d.month || !d.day) return { due: null, hasTime: false };
  if (work.dueTime) {
    // protobuf JSON은 0을 생략하므로 {}는 00:00 UTC를 뜻한다.
    return {
      due: new Date(Date.UTC(d.year, d.month - 1, d.day, work.dueTime.hours ?? 0, work.dueTime.minutes ?? 0)),
      hasTime: true,
    };
  }
  return { due: new Date(`${d.year}-${pad(d.month)}-${pad(d.day)}T23:59:00+09:00`), hasTime: false };
}

export async function fetchClassroom(account: GoogleAccount, now: Date = new Date()): Promise<ClassroomData> {
  const courses =
    (await gget<CoursesResponse>(account, `${BASE}/courses?studentId=me&courseStates=ACTIVE&pageSize=50`)).courses ?? [];
  const withAnnouncements = hasAnnouncementScope(account.scope);

  const perCourse = await mapLimit(courses, 5, async (course) => {
    const courseName = course.section ? `${course.name} ${course.section}` : course.name;
    const [work, subs, ann] = await Promise.all([
      settle(
        gget<{ courseWork?: GCourseWork[] }>(
          account,
          `${BASE}/courses/${course.id}/courseWork?${new URLSearchParams({
            courseWorkStates: "PUBLISHED",
            orderBy: "updateTime desc",
            pageSize: "40",
          })}`,
        ),
      ),
      settle(
        gget<SubmissionsResponse>(
          account,
          `${BASE}/courses/${course.id}/courseWork/-/studentSubmissions?${new URLSearchParams({
            userId: "me",
            pageSize: "200",
          })}`,
        ),
      ),
      withAnnouncements
        ? settle(
            gget<AnnouncementsResponse>(
              account,
              `${BASE}/courses/${course.id}/announcements?${new URLSearchParams({
                announcementStates: "PUBLISHED",
                orderBy: "updateTime desc",
                pageSize: "5",
              })}`,
            ),
          )
        : Promise.resolve(null),
    ]);
    if (!work.ok) return { error: work.error, assignments: [] as Assignment[], announcements: [] as Announcement[] };

    const submissionByWork = new Map(
      (subs.ok ? (subs.value.studentSubmissions ?? []) : []).map((s) => [s.courseWorkId, s]),
    );
    const assignments: Assignment[] = [];
    for (const w of work.value.courseWork ?? []) {
      const { due, hasTime } = resolveDue(w);
      const sub = submissionByWork.get(w.id);
      const submitted = sub?.state === "TURNED_IN" || sub?.state === "RETURNED";
      const created = w.creationTime ? new Date(w.creationTime) : now;
      // 마감 2주 전후 과제, 또는 최근 1주 안에 올라온 마감 없는 미제출 과제만 본다.
      const relevant = due
        ? due.getTime() > now.getTime() - 14 * DAY && due.getTime() < now.getTime() + 21 * DAY
        : !submitted && created.getTime() > now.getTime() - 7 * DAY;
      if (!relevant) continue;
      assignments.push({
        id: w.id,
        account: account.email,
        courseId: course.id,
        course: courseName,
        title: w.title?.trim() || "(제목 없음)",
        due: due ? due.toISOString() : null,
        dueHasTime: hasTime,
        submitted,
        late: Boolean(sub?.late),
        link: w.alternateLink ?? `https://classroom.google.com/c/${course.id}`,
        createdAt: created.toISOString(),
        points: w.maxPoints,
      });
    }

    const announcements: Announcement[] = (ann && ann.ok ? (ann.value.announcements ?? []) : [])
      .filter((a) => a.creationTime && new Date(a.creationTime).getTime() > now.getTime() - 3 * DAY)
      .map((a) => ({
        id: a.id,
        account: account.email,
        course: courseName,
        text: clampText(a.text ?? "", 200),
        createdAt: a.creationTime!,
        link: a.alternateLink ?? `https://classroom.google.com/c/${course.id}`,
      }));

    return { error: null, assignments, announcements };
  });

  const failed = perCourse.filter((c) => c.error);
  if (courses.length > 0 && failed.length === courses.length) throw failed[0].error;

  return {
    assignments: perCourse.flatMap((c) => c.assignments),
    announcements: perCourse
      .flatMap((c) => c.announcements)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    courseCount: courses.length,
  };
}
