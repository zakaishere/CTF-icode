"use client";
import { use } from "react";
import TeacherCTFSubmissions from "@/features/admin/pages/TeacherCTFSubmissions";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TeacherCTFSubmissions challengeId={id} />;
}
