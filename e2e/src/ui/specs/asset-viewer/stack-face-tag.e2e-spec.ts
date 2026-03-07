import { type AssetResponseDto } from '@immich/sdk';
import { expect, test } from '@playwright/test';
import { toAssetResponseDto } from 'src/ui/generators/timeline';
import {
  createMockStack,
  createMockStackAsset,
  MockStack,
  setupBrokenAssetMockApiRoutes,
} from 'src/ui/mock-network/broken-asset-network';
import {
  createMockPeople,
  FaceCreateCapture,
  MockPerson,
  setupFaceEditorMockApiRoutes,
} from 'src/ui/mock-network/face-editor-network';
import { assetViewerUtils } from '../timeline/utils';
import { ensureDetailPanelVisible, setupAssetViewerFixture } from './utils';

test.describe.configure({ mode: 'parallel' });
test.describe('stack face-tag selection preservation', () => {
  const fixture = setupAssetViewerFixture(910);
  let mockStack: MockStack;
  let primaryAssetDto: AssetResponseDto;
  let secondAssetDto: AssetResponseDto;
  let mockPeople: MockPerson[];
  let faceCreateCapture: FaceCreateCapture;

  test.beforeAll(async () => {
    primaryAssetDto = toAssetResponseDto(fixture.primaryAsset);
    secondAssetDto = createMockStackAsset(fixture.adminUserId);
    secondAssetDto.originalFileName = 'second-stacked-asset.jpg';
    mockStack = createMockStack(primaryAssetDto, [secondAssetDto], new Set());
    mockPeople = createMockPeople(3);
  });

  test.beforeEach(async ({ context }) => {
    faceCreateCapture = { requests: [] };
    await setupBrokenAssetMockApiRoutes(context, mockStack);
    await setupFaceEditorMockApiRoutes(context, mockPeople, faceCreateCapture);
  });

  test('selected stacked asset is preserved after tagging a face', async ({ page }) => {
    await page.goto(`/photos/${fixture.primaryAsset.id}`);
    await assetViewerUtils.waitForViewerLoad(page, fixture.primaryAsset);

    const stackSlideshow = page.locator('#stack-slideshow');
    await expect(stackSlideshow).toBeVisible();

    const stackThumbnails = stackSlideshow.locator('[data-asset]');
    await expect(stackThumbnails).toHaveCount(2);

    await stackThumbnails.nth(1).click();

    await ensureDetailPanelVisible(page);
    await expect(page.locator('#detail-panel')).toContainText('second-stacked-asset.jpg');

    await page.getByLabel('Tag people').click();
    await page.locator('#face-selector').waitFor({ state: 'visible' });

    await page.locator('#face-selector').getByText(mockPeople[0].name).click();

    const confirmButton = page.getByRole('button', { name: /confirm/i });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(page.locator('#face-selector')).toBeHidden();

    expect(faceCreateCapture.requests).toHaveLength(1);
    expect(faceCreateCapture.requests[0].assetId).toBe(secondAssetDto.id);

    await expect(page.locator('#detail-panel')).toContainText('second-stacked-asset.jpg');

    const selectedThumbnail = stackSlideshow.locator(`[data-asset="${secondAssetDto.id}"]`);
    await expect(selectedThumbnail).toBeVisible();
  });

  test('primary asset stays selected after tagging a face without switching', async ({ page }) => {
    await page.goto(`/photos/${fixture.primaryAsset.id}`);
    await assetViewerUtils.waitForViewerLoad(page, fixture.primaryAsset);

    await ensureDetailPanelVisible(page);
    await expect(page.locator('#detail-panel')).toContainText(primaryAssetDto.originalFileName);

    await page.getByLabel('Tag people').click();
    await page.locator('#face-selector').waitFor({ state: 'visible' });

    await page.locator('#face-selector').getByText(mockPeople[0].name).click();

    const confirmButton = page.getByRole('button', { name: /confirm/i });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(page.locator('#face-selector')).toBeHidden();

    expect(faceCreateCapture.requests).toHaveLength(1);
    expect(faceCreateCapture.requests[0].assetId).toBe(primaryAssetDto.id);

    await expect(page.locator('#detail-panel')).toContainText(primaryAssetDto.originalFileName);
  });
});
