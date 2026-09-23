import { mapLimit } from "../concurrency";
import { clampText, decodeEntities } from "../text";
import type { GoogleAccount } from "./accounts";
import { gget } from "./client";

/** 맥 에이전트(Claude)가 만든 요약. 없으면 아직 요약 전이다. */
export interface MailInsightView {
  important: boolean;
  summary: string;
  action: string | null;
  due: string | null;
}

export interface MailItem {
  id: string;
  threadId: string;
  account: string;
  from: string;
  fromAddress: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  important: boolean;
  starred: boolean;
  category: string;
  link: string;
  insight?: MailInsightView;
}

export interface MailBox {
  items: MailItem[];
  inboxUnread: number;
}

interface ListResponse {
  messages?: { id: string; threadId: string }[];
}

interface MessageResponse {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// 프로모션/소셜 탭은 아침 브리핑에서 빼고 최근 3일치 받은편지함만 본다.
const QUERY = "in:inbox newer_than:3d -category:promotions -category:social";

export async function fetchMail(account: GoogleAccount): Promise<MailBox> {
  const [list, inbox] = await Promise.all([
    gget<ListResponse>(account, `${BASE}/messages?${new URLSearchParams({ q: QUERY, maxResults: "20" })}`),
    gget<{ messagesUnread?: number }>(account, `${BASE}/labels/INBOX`),
  ]);
  const messages = await mapLimit(list.messages ?? [], 8, (m) =>
    gget<MessageResponse>(
      account,
      `${BASE}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
    ),
  );
  return {
    items: messages.map((m) => toMailItem(account.email, m)),
    inboxUnread: inbox.messagesUnread ?? 0,
  };
}

interface Part {
  mimeType?: string;
  body?: { data?: string };
  parts?: Part[];
}

function findPart(part: Part | undefined, mime: string): Part | undefined {
  if (!part) return undefined;
  if (part.mimeType === mime && part.body?.data) return part;
  for (const p of part.parts ?? []) {
    const found = findPart(p, mime);
    if (found) return found;
  }
  return undefined;
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

/** 요약에 쓸 본문 텍스트. 인용된 이전 메일 아래는 잘라낸다. */
export async function fetchMessageText(account: GoogleAccount, id: string, max = 1500): Promise<string> {
  const m = await gget<{ snippet?: string; payload?: Part }>(account, `${BASE}/messages/${id}?format=full`);
  const plain = findPart(m.payload, "text/plain");
  const html = plain ? undefined : findPart(m.payload, "text/html");
  const raw = plain
    ? Buffer.from(plain.body!.data!, "base64url").toString("utf8")
    : html
      ? htmlToText(Buffer.from(html.body!.data!, "base64url").toString("utf8"))
      : decodeEntities(m.snippet ?? "");
  const body = raw.split(/\n\s*(?:On .{0,200}wrote:|\d{4}년 .{0,80}작성:|-{2,}\s*Original Message|-{5,})/)[0];
  return clampText(body, max);
}

function header(m: MessageResponse, name: string): string {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseFrom(value: string): { name: string; address: string } {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim() || match[2], address: match[2] };
  return { name: value.trim() || "(보낸 사람 없음)", address: value.trim() };
}

function toMailItem(account: string, m: MessageResponse): MailItem {
  const labels = new Set(m.labelIds ?? []);
  const from = parseFrom(header(m, "From"));
  const category =
    [...labels].find((l) => l.startsWith("CATEGORY_"))?.slice("CATEGORY_".length).toLowerCase() ?? "personal";
  return {
    id: m.id,
    threadId: m.threadId,
    account,
    from: from.name,
    fromAddress: from.address,
    subject: header(m, "Subject").trim() || "(제목 없음)",
    snippet: decodeEntities(m.snippet ?? ""),
    date: new Date(Number(m.internalDate ?? Date.now())).toISOString(),
    unread: labels.has("UNREAD"),
    important: labels.has("IMPORTANT"),
    starred: labels.has("STARRED"),
    category,
    link: `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#all/${m.threadId}`,
  };
}
