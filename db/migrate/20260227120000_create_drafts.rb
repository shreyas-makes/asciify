# frozen_string_literal: true

class CreateDrafts < ActiveRecord::Migration[8.1]
  def change
    create_table :drafts do |t|
      t.references :user, foreign_key: true
      t.string :guest_token
      t.json :payload, null: false, default: {}
      t.integer :version, null: false, default: 1

      t.timestamps
    end

    add_index :drafts, :guest_token, unique: true
  end
end
