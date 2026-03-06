import { Selectable, ShallowDehydrateObject } from 'kysely';
import { AssetEditActionItem } from 'src/dtos/editing.dto';
import { ActivityTable } from 'src/schema/tables/activity.table';
import { AlbumTable } from 'src/schema/tables/album.table';
import { AssetExifTable } from 'src/schema/tables/asset-exif.table';
import { AssetFaceTable } from 'src/schema/tables/asset-face.table';
import { AssetFileTable } from 'src/schema/tables/asset-file.table';
import { AssetTable } from 'src/schema/tables/asset.table';
import { PartnerTable } from 'src/schema/tables/partner.table';
import { PersonTable } from 'src/schema/tables/person.table';
import { SharedLinkTable } from 'src/schema/tables/shared-link.table';
import { StackTable } from 'src/schema/tables/stack.table';
import { AlbumFactory } from 'test/factories/album.factory';
import { AssetFaceFactory } from 'test/factories/asset-face.factory';
import { AssetFactory } from 'test/factories/asset.factory';
import { MemoryFactory } from 'test/factories/memory.factory';
import { SharedLinkFactory } from 'test/factories/shared-link.factory';
import { StackFactory } from 'test/factories/stack.factory';
import { UserFactory } from 'test/factories/user.factory';

export const getForStorageTemplate = (asset: ReturnType<AssetFactory['build']>) => {
  return {
    id: asset.id,
    ownerId: asset.ownerId,
    livePhotoVideoId: asset.livePhotoVideoId,
    type: asset.type,
    isExternal: asset.isExternal,
    checksum: asset.checksum,
    timeZone: asset.exifInfo.timeZone,
    visibility: asset.visibility,
    fileCreatedAt: asset.fileCreatedAt,
    originalPath: asset.originalPath,
    originalFileName: asset.originalFileName,
    fileSizeInByte: asset.exifInfo.fileSizeInByte,
    files: asset.files,
    make: asset.exifInfo.make,
    model: asset.exifInfo.model,
    lensModel: asset.exifInfo.lensModel,
    isEdited: asset.isEdited,
  };
};

export const getAsDetectedFace = (face: ReturnType<AssetFaceFactory['build']>) => ({
  faces: [
    {
      boundingBox: {
        x1: face.boundingBoxX1,
        y1: face.boundingBoxY1,
        x2: face.boundingBoxX2,
        y2: face.boundingBoxY2,
      },
      embedding: '[1, 2, 3, 4]',
      score: 0.2,
    },
  ],
  imageHeight: face.imageHeight,
  imageWidth: face.imageWidth,
});

export const getForFacialRecognitionJob = (
  face: ReturnType<AssetFaceFactory['build']>,
  asset: Pick<Selectable<AssetTable>, 'ownerId' | 'visibility' | 'fileCreatedAt'> | null,
) => ({
  ...face,
  asset: asset
    ? { ownerId: asset.ownerId, visibility: asset.visibility, fileCreatedAt: asset.fileCreatedAt.toISOString() }
    : null,
  faceSearch: { faceId: face.id, embedding: '[1, 2, 3, 4]' },
});

export const getDehydratedUser = (user: ReturnType<UserFactory['build']>) => ({
  ...user,
  profileChangedAt: user.profileChangedAt.toISOString(),
});

export const getDehydratedAsset = (asset: Selectable<AssetTable>): ShallowDehydrateObject<Selectable<AssetTable>> => ({
  ...asset,
  checksum: asset.checksum.toString(),
  createdAt: asset.createdAt.toISOString(),
  deletedAt: asset.deletedAt?.toISOString() ?? null,
  fileCreatedAt: asset.fileCreatedAt.toISOString(),
  fileModifiedAt: asset.fileModifiedAt.toISOString(),
  localDateTime: asset.localDateTime.toISOString(),
  thumbhash: asset.thumbhash?.toString() ?? null,
  updatedAt: asset.updatedAt.toISOString(),
});

const getDehydratedExif = (exif: Selectable<AssetExifTable>): ShallowDehydrateObject<Selectable<AssetExifTable>> => ({
  ...exif,
  dateTimeOriginal: exif.dateTimeOriginal?.toISOString() ?? null,
  modifyDate: exif.modifyDate?.toISOString() ?? null,
  updatedAt: exif.updatedAt.toISOString(),
});

const getDehydratedSharedLink = (
  sharedLink: Selectable<SharedLinkTable>,
): ShallowDehydrateObject<Selectable<SharedLinkTable>> => ({
  ...sharedLink,
  createdAt: sharedLink.createdAt.toISOString(),
  expiresAt: sharedLink.expiresAt?.toISOString() ?? null,
  key: sharedLink.key.toString(),
});

const getDehydratedPerson = (person: Selectable<PersonTable>): ShallowDehydrateObject<Selectable<PersonTable>> => ({
  ...person,
  birthDate: person.birthDate?.toISOString() ?? null,
  createdAt: person.createdAt.toISOString(),
  updatedAt: person.updatedAt.toISOString(),
});

const getDehydratedFace = (face: Selectable<AssetFaceTable>): ShallowDehydrateObject<Selectable<AssetFaceTable>> => ({
  ...face,
  deletedAt: face.deletedAt?.toISOString() ?? null,
  updatedAt: face.updatedAt.toISOString(),
});

const getDehydratedStack = (stack: Selectable<StackTable>): ShallowDehydrateObject<Selectable<StackTable>> => ({
  ...stack,
  createdAt: stack.createdAt.toISOString(),
  updatedAt: stack.updatedAt.toISOString(),
});

const getDehydratedFile = (file: Selectable<AssetFileTable>): ShallowDehydrateObject<Selectable<AssetFileTable>> => ({
  ...file,
  createdAt: file.createdAt.toISOString(),
  updatedAt: file.updatedAt.toISOString(),
});

const getDehydratedAlbum = (album: Selectable<AlbumTable>): ShallowDehydrateObject<Selectable<AlbumTable>> => ({
  ...album,
  createdAt: album.createdAt.toISOString(),
  deletedAt: album.deletedAt ? album.deletedAt.toISOString() : null,
  updatedAt: album.updatedAt.toISOString(),
});

export const getForAlbum = (album: ReturnType<AlbumFactory['build']>) => ({
  ...album,
  assets: album.assets.map((asset) => ({ ...getDehydratedAsset(asset), exifInfo: getDehydratedExif(asset.exifInfo) })),
  albumUsers: album.albumUsers.map((albumUser) => ({
    ...albumUser,
    createdAt: albumUser.createdAt.toISOString(),
    user: getDehydratedUser(albumUser.user),
  })),
  owner: getDehydratedUser(album.owner),
  sharedLinks: album.sharedLinks.map((sharedLink) => getDehydratedSharedLink(sharedLink)),
});

export const getForActivity = (activity: Selectable<ActivityTable> & { user: ReturnType<UserFactory['build']> }) => ({
  ...activity,
  user: getDehydratedUser(activity.user),
});

export const getForAsset = (asset: ReturnType<AssetFactory['build']>) => {
  return {
    ...asset,
    faces: asset.faces.map((face) => ({
      ...getDehydratedFace(face),
      person: face.person ? getDehydratedPerson(face.person) : null,
    })),
    owner: getDehydratedUser(asset.owner),
    stack: asset.stack
      ? { ...getDehydratedStack(asset.stack), assets: asset.stack.assets.map((asset) => getDehydratedAsset(asset)) }
      : null,
    files: asset.files.map((file) => getDehydratedFile(file)),
    exifInfo: asset.exifInfo ? getDehydratedExif(asset.exifInfo) : null,
    edits: asset.edits.map(({ action, parameters }) => ({ action, parameters })) as AssetEditActionItem[],
  };
};

export const getForPartner = (
  partner: Selectable<PartnerTable> & Record<'sharedWith' | 'sharedBy', ReturnType<UserFactory['build']>>,
) => ({
  ...partner,
  sharedBy: getDehydratedUser(partner.sharedBy),
  sharedWith: getDehydratedUser(partner.sharedWith),
});

export const getForMemory = (memory: ReturnType<MemoryFactory['build']>) => ({
  ...memory,
  assets: memory.assets.map((asset) => getDehydratedAsset(asset)),
});

export const getForMetadataExtraction = (asset: ReturnType<AssetFactory['build']>) => ({
  id: asset.id,
  checksum: asset.checksum,
  deviceAssetId: asset.deviceAssetId,
  deviceId: asset.deviceId,
  fileCreatedAt: asset.fileCreatedAt,
  fileModifiedAt: asset.fileModifiedAt,
  isExternal: asset.isExternal,
  visibility: asset.visibility,
  libraryId: asset.libraryId,
  livePhotoVideoId: asset.livePhotoVideoId,
  localDateTime: asset.localDateTime,
  originalFileName: asset.originalFileName,
  originalPath: asset.originalPath,
  ownerId: asset.ownerId,
  type: asset.type,
  width: asset.width,
  height: asset.height,
  faces: asset.faces.map((face) => getDehydratedFace(face)),
  files: asset.files.map((file) => getDehydratedFile(file)),
});

export const getForGenerateThumbnail = (asset: ReturnType<AssetFactory['build']>) => ({
  id: asset.id,
  visibility: asset.visibility,
  originalFileName: asset.originalFileName,
  originalPath: asset.originalPath,
  ownerId: asset.ownerId,
  thumbhash: asset.thumbhash,
  type: asset.type,
  files: asset.files.map((file) => getDehydratedFile(file)),
  exifInfo: getDehydratedExif(asset.exifInfo),
  edits: asset.edits.map(({ action, parameters }) => ({ action, parameters })) as AssetEditActionItem[],
});

export const getForAssetFace = (face: ReturnType<AssetFaceFactory['build']>) => ({
  ...face,
  person: face.person ? getDehydratedPerson(face.person) : null,
});

export const getForDetectedFaces = (asset: ReturnType<AssetFactory['build']>) => ({
  id: asset.id,
  visibility: asset.visibility,
  exifInfo: getDehydratedExif(asset.exifInfo),
  faces: asset.faces.map((face) => getDehydratedFace(face)),
  files: asset.files.map((file) => getDehydratedFile(file)),
});

export const getForSidecarWrite = (asset: ReturnType<AssetFactory['build']>) => ({
  id: asset.id,
  originalPath: asset.originalPath,
  files: asset.files.map((file) => getDehydratedFile(file)),
  exifInfo: getDehydratedExif(asset.exifInfo),
});

export const getForAssetDeletion = (asset: ReturnType<AssetFactory['build']>) => ({
  id: asset.id,
  visibility: asset.visibility,
  libraryId: asset.libraryId,
  ownerId: asset.ownerId,
  livePhotoVideoId: asset.livePhotoVideoId,
  encodedVideoPath: asset.encodedVideoPath,
  originalPath: asset.originalPath,
  isOffline: asset.isOffline,
  exifInfo: asset.exifInfo ? getDehydratedExif(asset.exifInfo) : null,
  files: asset.files.map((file) => getDehydratedFile(file)),
  stack: asset.stack
    ? {
        ...getDehydratedStack(asset.stack),
        assets: asset.stack.assets.filter(({ id }) => id !== asset.stack?.primaryAssetId).map(({ id }) => ({ id })),
      }
    : null,
});

export const getForStack = (stack: ReturnType<StackFactory['build']>) => ({
  ...stack,
  assets: stack.assets.map((asset) => ({
    ...getDehydratedAsset(asset),
    exifInfo: getDehydratedExif(asset.exifInfo),
  })),
});

export const getForDuplicate = (asset: ReturnType<AssetFactory['build']>) => ({
  ...getDehydratedAsset(asset),
  exifInfo: getDehydratedExif(asset.exifInfo),
});

export const getForSharedLink = (sharedLink: ReturnType<SharedLinkFactory['build']>) => ({
  ...sharedLink,
  assets: sharedLink.assets.map((asset) => ({
    ...getDehydratedAsset(asset),
    exifInfo: getDehydratedExif(asset.exifInfo),
  })),
  album: sharedLink.album
    ? {
        ...getDehydratedAlbum(sharedLink.album),
        owner: getDehydratedUser(sharedLink.album.owner),
        assets: sharedLink.album.assets.map((asset) => getDehydratedAsset(asset)),
      }
    : null,
});
