import { getKV } from "./store/kv";

// 화면에 보여 줄 데이터가 새로 들어오면 버전을 올린다. 열려 있는 대시보드는 이 값만 짧게 확인하다가
// 바뀌면 새로 그린다. (Redis 명령 한 번이라 무료 한도에 부담이 없다)
const KEY = "dash:version";

export async function bumpVersion(): Promise<void> {
  await getKV().set(KEY, String(Date.now()));
}

export async function getVersion(): Promise<string> {
  return (await getKV().get(KEY)) ?? "0";
}
