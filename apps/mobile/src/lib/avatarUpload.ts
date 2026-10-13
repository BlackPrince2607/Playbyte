import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { api } from "../api";

const AVATAR_PX = 512;

/** Lets the player crop a photo from their library, shrinks it and uploads it. Resolves null if they cancel. */
export async function pickAndUploadAvatar(): Promise<string | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.length) return null;

  const context = ImageManipulator.manipulate(picked.assets[0].uri);
  context.resize({ width: AVATAR_PX, height: AVATAR_PX });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });

  const form = new FormData();
  // React Native's fetch uploads a local file from this { uri, name, type } shape.
  form.append("file", { uri: saved.uri, name: "avatar.jpg", type: "image/jpeg" } as unknown as Blob);
  const res = await api<{ avatarKey: string }>("/v1/me/avatar", { method: "POST", body: form });
  return res.avatarKey;
}

export async function removeAvatar(): Promise<void> {
  await api("/v1/me/avatar", { method: "DELETE" });
}
