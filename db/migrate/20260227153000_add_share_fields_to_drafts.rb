# frozen_string_literal: true

class AddShareFieldsToDrafts < ActiveRecord::Migration[8.1]
  def change
    add_column :drafts, :share_token, :string
    add_column :drafts, :share_permission, :string, null: false, default: "view"

    add_index :drafts, :share_token, unique: true
  end
end
