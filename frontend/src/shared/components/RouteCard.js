import React from 'react';
import { getFleetColor } from '../utils/colors';

const RouteCard = ({ order, index, onDelete }) => {
    const priorityColors = {
        High: '#000000',
        Medium: '#666666',
        Low: '#999999'
    };

    const cardColor = getFleetColor(order.driverId);
    const isWhiteBackground = cardColor.toLowerCase() === '#ffffff';

    return (
        <div className="route-card">
            <div 
                className="card-index-box" 
                style={{ 
                    backgroundColor: cardColor,
                    color: isWhiteBackground ? '#000000' : '#ffffff'
                }}
            >
                <span className="index-num">{index + 1}</span>
            </div>
            <div className="card-content">
                <div className="card-top">
                    <h3>{order.customer}</h3>
                    {onDelete && (
                        <button
                            className="delete-card-btn"
                            onClick={() => onDelete(order.id)}
                            title="Delete Order"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    )}
                </div>
                <p className="address">{order.address}</p>
                <div className="card-footer">
                    <span
                        className="priority-badge"
                        style={{ 
                            backgroundColor: priorityColors[order.priority] || '#333',
                            color: priorityColors[order.priority] === '#ffffff' ? '#000000' : '#ffffff'
                        }}
                    >
                        {order.priority}
                    </span>
                    <span className="weight-badge">{order.weight} kg</span>
                    {order.driverId && (
                        <span
                            className="fleet-badge"
                            style={{
                                backgroundColor: isWhiteBackground ? '#ffffff' : 'transparent',
                                border: `1px solid ${cardColor}`,
                                color: isWhiteBackground ? '#000000' : cardColor,
                                fontWeight: '700'
                            }}
                        >
                            Fleet: {order.driverId}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RouteCard;
