// macOS 알림 기록(바이너리 plist, bplist00)을 읽는 작은 파서. 외부 패키지 없이 쓰려고 직접 구현했다.
const MAC_EPOCH_SECONDS = 978307200; // 2001-01-01T00:00:00Z

export function parseBplist(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.length < 40 || buf.toString("latin1", 0, 6) !== "bplist") throw new Error("binary plist가 아니에요");

  const trailer = buf.subarray(buf.length - 32);
  const offsetSize = trailer.readUInt8(6);
  const refSize = trailer.readUInt8(7);
  const numObjects = Number(trailer.readBigUInt64BE(8));
  const topObject = Number(trailer.readBigUInt64BE(16));
  const tableOffset = Number(trailer.readBigUInt64BE(24));

  const readUInt = (pos, size) => {
    let v = 0;
    for (let i = 0; i < size; i++) v = v * 256 + buf[pos + i];
    return v;
  };
  const offsets = new Array(numObjects);
  for (let i = 0; i < numObjects; i++) offsets[i] = readUInt(tableOffset + i * offsetSize, offsetSize);

  // 길이 정보가 0xF면 뒤따르는 정수 객체에 실제 길이가 들어 있다.
  const lengthAt = (pos, info) => {
    if (info !== 0xf) return [info, pos + 1];
    const intSize = 1 << (buf[pos + 1] & 0xf);
    return [readUInt(pos + 2, intSize), pos + 2 + intSize];
  };

  const seen = new Map();
  const parse = (ref, depth) => {
    if (depth > 64) throw new Error("plist가 너무 깊어요");
    if (seen.has(ref)) return seen.get(ref);
    const pos = offsets[ref];
    const marker = buf[pos];
    const type = marker >> 4;
    const info = marker & 0xf;
    let value;
    switch (type) {
      case 0x0:
        value = info === 0x8 ? false : info === 0x9 ? true : null;
        break;
      case 0x1: {
        const size = 1 << info;
        value = size === 8 ? Number(buf.readBigInt64BE(pos + 1)) : size === 16 ? Number(buf.readBigInt64BE(pos + 9)) : readUInt(pos + 1, size);
        break;
      }
      case 0x2:
        value = info === 2 ? buf.readFloatBE(pos + 1) : buf.readDoubleBE(pos + 1);
        break;
      case 0x3:
        value = new Date((MAC_EPOCH_SECONDS + buf.readDoubleBE(pos + 1)) * 1000);
        break;
      case 0x4: {
        const [len, start] = lengthAt(pos, info);
        value = buf.subarray(start, start + len);
        break;
      }
      case 0x5: {
        const [len, start] = lengthAt(pos, info);
        value = buf.toString("latin1", start, start + len);
        break;
      }
      case 0x6: {
        const [len, start] = lengthAt(pos, info);
        const utf16 = Buffer.from(buf.subarray(start, start + len * 2));
        value = utf16.swap16().toString("utf16le");
        break;
      }
      case 0x7: {
        const [len, start] = lengthAt(pos, info);
        value = buf.toString("utf8", start, start + len);
        break;
      }
      case 0x8:
        value = { UID: readUInt(pos + 1, info + 1) };
        break;
      case 0xa:
      case 0xc: {
        const [len, start] = lengthAt(pos, info);
        value = [];
        seen.set(ref, value);
        for (let i = 0; i < len; i++) value.push(parse(readUInt(start + i * refSize, refSize), depth + 1));
        return value;
      }
      case 0xd: {
        const [len, start] = lengthAt(pos, info);
        value = {};
        seen.set(ref, value);
        for (let i = 0; i < len; i++) {
          const key = parse(readUInt(start + i * refSize, refSize), depth + 1);
          value[String(key)] = parse(readUInt(start + (len + i) * refSize, refSize), depth + 1);
        }
        return value;
      }
      default:
        throw new Error(`알 수 없는 plist 표시 0x${marker.toString(16)}`);
    }
    seen.set(ref, value);
    return value;
  };

  return parse(topObject, 0);
}
