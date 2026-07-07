"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createPerson(data: {
  name: string;
  birthday?: string;
  notes?: string;
}) {
  const person = await prisma.person.create({
    data: {
      ...data,
      birthday: data.birthday ? new Date(data.birthday) : undefined,
    },
  });
  revalidatePath("/people");
  return person;
}

export async function updatePerson(
  id: string,
  data: { name?: string; birthday?: string | null; notes?: string }
) {
  const person = await prisma.person.update({
    where: { id },
    data: {
      ...data,
      birthday: data.birthday === null ? null : data.birthday ? new Date(data.birthday) : undefined,
    },
  });
  revalidatePath("/people");
  revalidatePath(`/people/${id}`);
  return person;
}

export async function deletePerson(id: string) {
  await prisma.person.delete({ where: { id } });
  revalidatePath("/people");
}
