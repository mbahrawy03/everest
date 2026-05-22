// ============================================================
//  EveResT — Supabase Configuration
// ============================================================
const SUPABASE_URL = 'https://jdilonaynvdluydwdxuv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkaWxvbmF5bnZkbHV5ZHdkeHV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNTU0NTksImV4cCI6MjA5NDczMTQ1OX0.cMsgkHRpdwhS0dT07qGVQBujKQs2r-ckH08gc_Pepj0';

// Edge function endpoint
const FUNCTIONS_URL = SUPABASE_URL + '/functions/v1';

// Helper: send an order status email to the customer
async function sendOrderEmail(orderId, status) {
  try {
    const { createClient } = supabase;
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: order } = await db
      .from('orders')
      .select('*, customers(full_name, email)')
      .eq('id', orderId)
      .single();
    if (!order) return;
    const customer = {
      email: order.customers?.email || order.shipping_info?.email,
      name:  order.customers?.full_name ||
             `${order.shipping_info?.firstName || ''} ${order.shipping_info?.lastName || ''}`.trim() ||
             'there',
    };
    if (!customer.email) return;
    order.status = status;
    await fetch(`${FUNCTIONS_URL}/send-order-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ order, customer }),
    });
  } catch(e) {
    console.warn('Email notification failed:', e);
  }
}
