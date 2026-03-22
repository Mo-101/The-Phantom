import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  try {
    const { CorridorService } = await import('@/src/services/corridor');
    const service = new CorridorService();
    const item = await service.getCorridorById(id);

    if (!item) {
      return NextResponse.json(
        { error: `Corridor ${id} not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json(item);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
