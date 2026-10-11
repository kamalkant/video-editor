import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const runtime = "nodejs";

function getDocumentsVdoDir(): string {
  const docs = path.join(os.homedir(), "Documents");
  const target = path.join(docs, "VDO");
  if (!fs.existsSync(target)) {
    try {
      fs.mkdirSync(target, { recursive: true });
    } catch {
      // fallback
    }
  }
  return target;
}

export async function GET() {
  try {
    const dir = getDocumentsVdoDir();
    const exists = fs.existsSync(dir);
    return NextResponse.json({
      ok: true,
      folderName: "Documents/vdo",
      systemPath: dir,
      exists,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileName, content, isTest } = body;

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json({ ok: false, error: "fileName is required" }, { status: 400 });
    }

    // Sanitize fileName to prevent directory traversal
    const safeName = path.basename(fileName);
    const dir = getDocumentsVdoDir();
    const targetFile = path.join(dir, safeName);

    const payload = typeof content === "string" ? content : JSON.stringify(content, null, 2);
    fs.writeFileSync(targetFile, payload, "utf8");

    return NextResponse.json({
      ok: true,
      folderName: "Documents/vdo",
      filePath: targetFile,
      isTest: !!isTest,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
