import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { buildOKFGovernanceMetrics } from "@/factoryos/core/governance/OKFGovernanceMetrics";

export async function GET(){
  try {
    const root=process.cwd();
    const data=JSON.parse(await readFile(path.join(root,".okf/rules/index.json"),"utf8"));
    return NextResponse.json(buildOKFGovernanceMetrics(Array.isArray(data.rules)?data.rules:[]));
  } catch (error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to load OKF governance metrics."},{status:500});
  }
}
