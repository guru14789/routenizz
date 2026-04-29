"""ORION-ELITE Alembic Migration — adds all new tables for the Elite suite."""
from alembic import op
import sqlalchemy as sa

revision = 'orion_elite_001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── driver_intent_log ─────────────────────────────────────────────────────
    op.create_table(
        'driver_intent_log',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('vehicle_id', sa.String(), nullable=False, index=True),
        sa.Column('driver_id', sa.String(), nullable=True),
        sa.Column('from_node', sa.String(), nullable=False),
        sa.Column('to_node', sa.String(), nullable=False),
        sa.Column('from_lat', sa.Float(), nullable=True),
        sa.Column('from_lng', sa.Float(), nullable=True),
        sa.Column('to_lat', sa.Float(), nullable=True),
        sa.Column('to_lng', sa.Float(), nullable=True),
        sa.Column('avoidance_reason', sa.String(), nullable=True),
        sa.Column('avoidance_count', sa.Integer(), default=1),
        sa.Column('preference_score', sa.Float(), default=2.5),
        sa.Column('timestamp', sa.DateTime()),
        sa.Column('last_seen', sa.DateTime()),
    )
    op.create_index('idx_driver_intent_vehicle_segment',
                    'driver_intent_log', ['vehicle_id', 'from_node', 'to_node'])

    # ── constraint_profiles ───────────────────────────────────────────────────
    op.create_table(
        'constraint_profiles',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('profile_name', sa.String(), unique=True, index=True),
        sa.Column('profile_type', sa.String()),
        sa.Column('entity_id', sa.String(), nullable=True),
        sa.Column('constraints', sa.JSON()),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('updated_at', sa.DateTime()),
    )

    # ── simulation_log ────────────────────────────────────────────────────────
    op.create_table(
        'simulation_log',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('scenario_type', sa.String()),
        sa.Column('scenario_name', sa.String()),
        sa.Column('baseline_cost', sa.Float()),
        sa.Column('simulated_cost', sa.Float()),
        sa.Column('cost_delta', sa.Float()),
        sa.Column('baseline_duration_min', sa.Float()),
        sa.Column('simulated_duration_min', sa.Float()),
        sa.Column('duration_delta_min', sa.Float()),
        sa.Column('baseline_co2_kg', sa.Float()),
        sa.Column('simulated_co2_kg', sa.Float()),
        sa.Column('routes_affected', sa.Integer()),
        sa.Column('recommendation', sa.Text()),
        sa.Column('full_result', sa.JSON()),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('created_by', sa.String(), nullable=True),
    )

    # ── reopt_events ──────────────────────────────────────────────────────────
    op.create_table(
        'reopt_events',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('trigger', sa.String()),
        sa.Column('trigger_data', sa.JSON()),
        sa.Column('affected_vehicle_ids', sa.JSON()),
        sa.Column('stops_rerouted', sa.Integer()),
        sa.Column('cost_before', sa.Float(), nullable=True),
        sa.Column('cost_after', sa.Float(), nullable=True),
        sa.Column('cost_delta', sa.Float(), nullable=True),
        sa.Column('time_saved_min', sa.Float(), nullable=True),
        sa.Column('solver_time_ms', sa.Float(), nullable=True),
        sa.Column('status', sa.String()),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('timestamp', sa.DateTime()),
    )
    op.create_index('idx_reopt_events_trigger_time',
                    'reopt_events', ['trigger', 'timestamp'])

    # ── route_segments ────────────────────────────────────────────────────────
    op.create_table(
        'route_segments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('trip_history_id', sa.Integer(),
                  sa.ForeignKey('trip_history.id'), nullable=True),
        sa.Column('vehicle_id', sa.String(), index=True),
        sa.Column('from_stop_id', sa.String()),
        sa.Column('to_stop_id', sa.String()),
        sa.Column('from_lat', sa.Float()),
        sa.Column('from_lng', sa.Float()),
        sa.Column('to_lat', sa.Float()),
        sa.Column('to_lng', sa.Float()),
        sa.Column('planned_duration_sec', sa.Float()),
        sa.Column('planned_distance_km', sa.Float()),
        sa.Column('actual_duration_sec', sa.Float(), nullable=True),
        sa.Column('actual_distance_km', sa.Float(), nullable=True),
        sa.Column('turn_type', sa.String(), nullable=True),
        sa.Column('turn_penalty_applied', sa.Float(), default=1.0),
        sa.Column('zone_penalty_applied', sa.Float(), default=1.0),
        sa.Column('sequence_position', sa.Integer()),
        sa.Column('timestamp', sa.DateTime()),
    )

    # ── extend existing orders table ──────────────────────────────────────────
    op.add_column('orders', sa.Column('priority', sa.Integer(), server_default='5'))
    op.add_column('orders', sa.Column('stop_type', sa.String(), server_default='Residential'))
    op.add_column('orders', sa.Column('demand_units', sa.Float(), server_default='1.0'))
    op.add_column('orders', sa.Column('time_window_start', sa.Integer(), server_default='0'))
    op.add_column('orders', sa.Column('time_window_end', sa.Integer(), server_default='86400'))
    op.add_column('orders', sa.Column('assigned_vehicle_id', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('updated_at', sa.DateTime(), nullable=True))

    # ── extend existing vehicles table ────────────────────────────────────────
    op.add_column('vehicles', sa.Column('is_electric', sa.Boolean(), server_default='false'))
    op.add_column('vehicles', sa.Column('consumption_liters_per_100km', sa.Float(), server_default='12.0'))
    op.add_column('vehicles', sa.Column('fuel_price_per_litre', sa.Float(), server_default='95.0'))
    op.add_column('vehicles', sa.Column('cost_per_km', sa.Float(), server_default='1.5'))
    op.add_column('vehicles', sa.Column('driver_hourly_wage', sa.Float(), server_default='250.0'))
    op.add_column('vehicles', sa.Column('shift_start', sa.Integer(), server_default='28800'))
    op.add_column('vehicles', sa.Column('shift_end', sa.Integer(), server_default='64800'))
    op.add_column('vehicles', sa.Column('assigned_zone', sa.Integer(), nullable=True))

    # ── extend trip_history ───────────────────────────────────────────────────
    op.add_column('trip_history', sa.Column('total_co2_kg', sa.Float(), server_default='0'))
    op.add_column('trip_history', sa.Column('co2_saved_kg', sa.Float(), server_default='0'))
    op.add_column('trip_history', sa.Column('trigger', sa.String(), server_default='manual'))
    op.add_column('trip_history', sa.Column('explainability_report', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_table('route_segments')
    op.drop_table('reopt_events')
    op.drop_table('simulation_log')
    op.drop_table('constraint_profiles')
    op.drop_table('driver_intent_log')
