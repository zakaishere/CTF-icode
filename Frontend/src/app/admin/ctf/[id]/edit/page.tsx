"use client";
import { use } from "react";
import TeacherCTFForm from "@/features/admin/pages/TeacherCTFForm";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TeacherCTFForm editId={id} />;
}
