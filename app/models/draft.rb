# frozen_string_literal: true

class Draft < ApplicationRecord
  belongs_to :user, optional: true

  validates :version, numericality: {only_integer: true, greater_than_or_equal_to: 1}
  validates :payload, presence: true
  validates :guest_token, presence: true, unless: :user_id?
  validates :share_permission, inclusion: {in: %w[view edit]}

  scope :for_guest, ->(token) { where(guest_token: token) }
end
