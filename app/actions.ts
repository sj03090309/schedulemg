"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { toggleCheck } from "@/lib/checks";
import { clearCached } from "@/lib/concurrency";
import { listAccounts, removeAccount, renameAccount } from "@/lib/google/accounts";
import { revokeToken } from "@/lib/google/oauth";
import { addMemo, deleteMemo, toggleMemo } from "@/lib/memos";
import { DEFAULT_RULES, saveRules, updateNotification } from "@/lib/notifications";
import { getSession } from "@/lib/session";
import { dateKey, shiftDateKey } from "@/lib/time";
import { removeUsageHost } from "@/lib/usage/store";

// 서버 액션은 proxy를 거치지 않을 수도 있으므로 매번 세션을 확인한다.
async function ensureSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
// 예시 화면(?demo=1)의 항목은 저장하지 않는다.
const isDemo = (ref: string) => ref.startsWith("demo");

export async function toggleItemAction(form: FormData) {
  await ensureSession();
  const type = field(form, "type");
  const ref = field(form, "ref");
  if (!ref || isDemo(ref)) return;
  if (type === "check") await toggleCheck(ref);
  else if (type === "memo") await toggleMemo(ref);
  else if (type === "notification") {
    await updateNotification(ref, { status: field(form, "current") === "open" ? "done" : "open" });
  }
  refresh();
}

export async function addMemoAction(form: FormData) {
  await ensureSession();
  const text = field(form, "text");
  if (!text) return;
  const when = field(form, "when");
  const today = dateKey();
  const date =
    when === "none" ? null : when === "tomorrow" ? shiftDateKey(today, 1) : /^\d{4}-\d{2}-\d{2}$/.test(when) ? when : today;
  await addMemo(text, date);
  refresh();
}

export async function deleteMemoAction(form: FormData) {
  await ensureSession();
  const id = field(form, "id");
  if (!id || isDemo(id)) return;
  await deleteMemo(id);
  refresh();
}

export async function notificationAction(form: FormData) {
  await ensureSession();
  const id = field(form, "id");
  if (!id || isDemo(id)) return;
  switch (field(form, "action")) {
    case "done":
      await updateNotification(id, { status: "done" });
      break;
    case "dismiss":
      await updateNotification(id, { status: "dismissed" });
      break;
    case "important":
      await updateNotification(id, { importance: "high", status: "open" });
      break;
    case "reopen":
      await updateNotification(id, { status: "open" });
      break;
  }
  refresh();
}

export async function refreshNowAction() {
  await ensureSession();
  clearCached("g:");
  refresh();
}

function lines(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))].slice(0, 200);
}

export async function saveRulesAction(form: FormData) {
  await ensureSession();
  await saveRules({
    keywords: lines(field(form, "keywords")),
    importantApps: lines(field(form, "importantApps")),
    mutedApps: lines(field(form, "mutedApps")),
    dropSecurityCodes: form.get("dropSecurityCodes") === "on",
  });
  refresh();
}

export async function resetRulesAction() {
  await ensureSession();
  await saveRules(DEFAULT_RULES);
  refresh();
}

export async function renameAccountAction(form: FormData) {
  await ensureSession();
  const email = field(form, "email");
  if (!email) return;
  await renameAccount(email, field(form, "label"));
  refresh();
}

export async function removeAccountAction(form: FormData) {
  const session = await ensureSession();
  const email = field(form, "email");
  const account = (await listAccounts()).find((a) => a.email === email);
  if (!account) return;
  if (account.refreshToken) await revokeToken(account.refreshToken);
  await removeAccount(email);
  clearCached(`g:${email}:`);
  // 지금 로그인한 계정을 지우면 다시 로그인하게 한다.
  if (!session.dev && session.email === email) redirect("/login");
  refresh();
}

export async function removeHostAction(form: FormData) {
  await ensureSession();
  const host = field(form, "host");
  if (host) await removeUsageHost(host);
  refresh();
}
