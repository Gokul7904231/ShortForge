import ShortForgeEditorPageClient from "@/components/editor/ShortForgeEditorPageClient";

interface FactoryEditorPageProps {
  searchParams: Promise<{ jobId?: string | string[] }>;
}

/** A dedicated editor page; opening Pencil never reuses the generation overlay. */
export default async function FactoryEditorPage({ searchParams }: FactoryEditorPageProps) {
  const params = await searchParams;
  const requestedJobId = Array.isArray(params.jobId) ? params.jobId[0] : params.jobId;
  const jobId = typeof requestedJobId === "string" ? requestedJobId : "";

  return <ShortForgeEditorPageClient jobId={jobId} />;
}
