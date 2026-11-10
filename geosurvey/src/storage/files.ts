/** Fichiers locaux : photos des entités et fichiers d'export à partager. */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { uuid } from '../core/id';
import type { ExportResult } from '../export';

function ensureDir(...segments: string[]): Directory {
  const dir = new Directory(Paths.document, ...segments);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Copie une photo (caméra ou galerie) dans le stockage permanent de l'application. */
export function savePhoto(sourceUri: string): string {
  const source = new File(sourceUri);
  const ext = (source.extension || '.jpg').toLowerCase();
  const target = new File(ensureDir('photos'), `${uuid()}${ext}`);
  source.copySync(target);
  return target.uri;
}

export function deletePhoto(uri: string): void {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Fichier déjà supprimé : rien à faire.
  }
}

export async function readFileBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

/** Écrit un export dans le cache puis ouvre la feuille de partage du système. */
export async function writeAndShareExport(result: ExportResult): Promise<string> {
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, result.filename);
  if (file.exists) file.delete();
  file.create();
  file.write(result.data);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: result.mimeType,
      UTI: result.uti,
      dialogTitle: `Partager ${result.filename}`,
    });
  }
  return file.uri;
}
