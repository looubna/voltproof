import { loadCase } from "@/components/case-header";

/**
 * Checks the case exists before any of its pages render. notFound() here runs
 * before the response starts streaming, so an unknown case id gets a real 404
 * status (inside a Suspense boundary it could only be a 200 with "Not found").
 * loadCase is cached per request, so the page reuses this read.
 */
export default async function CaseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  await loadCase((await params).id);
  return children;
}
