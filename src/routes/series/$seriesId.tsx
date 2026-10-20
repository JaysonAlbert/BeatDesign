import { createFileRoute } from '@tanstack/react-router';
import { ProductPageShell } from '@/components/app/product-page-shell';
import { SeriesHub } from '@/components/app/series-hub';
export const Route = createFileRoute('/series/$seriesId')({
  component: SeriesPage,
});
function SeriesPage() {
  const { seriesId } = Route.useParams();
  return (
    <ProductPageShell>
      <SeriesHub seriesId={seriesId} />
    </ProductPageShell>
  );
}
