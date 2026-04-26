import React from 'react';
import { getFleetColor } from '../utils/colors';

const RouteCard = ({ order, index, onDelete }) => {
    return (
        <div className="analytics-card" style={{ padding: '16px', border: '2px solid #000', background: '#fff', position: 'relative', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ width: '32px', height: '32px', background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 900, flexShrink: 0 }}>
                {index + 1}
            </div>
            
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{order.customer}</h3>
                    {onDelete && (
                        <button
                            onClick={() => onDelete(order.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#666' }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    )}
                </div>
                <p style={{ fontSize: '10px', color: '#666', margin: '0 0 8px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.address}</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '8px', fontWeight: 900, border: '1px solid #000', padding: '1px 6px' }}>
                        [{order.priority.toUpperCase()}]
                    </span>
                    <span style={{ fontSize: '8px', fontWeight: 900, background: '#000', color: '#fff', padding: '1px 6px' }}>
                        {order.weight}KG
                    </span>
                    {order.driverId && (
                        <span style={{ fontSize: '8px', fontWeight: 900, border: '1px solid #000', padding: '1px 6px' }}>
                            UNIT_{order.driverId}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RouteCard;
